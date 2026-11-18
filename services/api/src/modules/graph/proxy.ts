import { answerFromSnapshot } from './fallback.js';
import type { Snapshot, Source } from './types.js';

export interface ProxyOptions {
  serviceUrl: string;
  apiKey: string;
  snapshot: Snapshot;
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
  /** Treat the service as down (end-to-end tests only). */
  simulateDown?: boolean;
  /** Forwarded as x-request-id so logs line up across services. */
  requestId?: string;
}

const SEGMENT = /^[\w.-]+$/;

const respond = (status: number, source: Source, payload: { data: unknown } | { error: string }) =>
  Response.json({ source, ...payload }, { status, headers: { 'cache-control': 'no-store', 'x-graph-source': source } });

const detailOf = (body: unknown): string => {
  const d = (body as { detail?: unknown })?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d[0] && typeof d[0].msg === 'string') return d[0].msg;
  return 'Request failed';
};

function fromSnapshot(path: string, query: URLSearchParams, snapshot: Snapshot): Response {
  const { status, data } = answerFromSnapshot(path, query, snapshot);
  return status < 300 ? respond(status, 'snapshot', { data }) : respond(status, 'snapshot', { error: detailOf(data) });
}

/**
 * Forward a request for /v1/graph/<path> to the graph service.
 *
 * - 2xx: `{source: 'live', data}`
 * - 404 / 422 from the service: passed through as `{source: 'live', error}`
 * - unreachable, timeout, 401 or 5xx: answered from the snapshot, `{source: 'snapshot', ...}`
 */
export async function proxyGraph(request: Request, segments: string[], opts: ProxyOptions): Promise<Response> {
  if (!segments.length || !segments.every((s) => SEGMENT.test(s) && s !== '..' && s !== '.')) {
    return respond(404, 'live', { error: 'Not found' });
  }
  const path = segments.join('/');
  const query = new URL(request.url).searchParams;
  if (opts.simulateDown) return fromSnapshot(path, query, opts.snapshot);

  const target = `${opts.serviceUrl.replace(/\/$/, '')}${path === 'health' ? '/health' : `/v1/${path}`}${query.size ? `?${query}` : ''}`;
  const init: RequestInit = {
    method: request.method,
    headers: {
      'x-api-key': opts.apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
      ...(opts.requestId ? { 'x-request-id': opts.requestId } : {}),
    },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 2000),
  };
  if (request.method === 'POST') init.body = await request.text();

  try {
    const res = await opts.fetchImpl(target, init);
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) return respond(res.status, 'live', { data: body });
    if (res.status === 404 || res.status === 422) return respond(res.status, 'live', { error: detailOf(body) });
  } catch {
    /* unreachable or timed out: fall through to the snapshot */
  }
  return fromSnapshot(path, query, opts.snapshot);
}
