export interface ApiProxyOptions {
  apiUrl: string;
  /** Undefined when not configured: the route then refuses to forward rather than use a guessable key. */
  apiKey: string | undefined;
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

const SEGMENT = /^[\w.-]+$/;
const SAFE_METHODS = new Set(['GET', 'HEAD']);

/** The key to send: API_KEY, or `dev-key` only outside production. Never a default in production. */
export function apiKeyFrom(env: Record<string, string | undefined>): string | undefined {
  if (env.API_KEY) return env.API_KEY;
  return env.NODE_ENV === 'production' ? undefined : 'dev-key';
}

/**
 * True for a write another site made the browser send. Fetch metadata
 * (Sec-Fetch-Site) first, then Origin; requests with neither (curl, server
 * code) are not browser cross-site requests.
 */
function crossSiteWrite(request: Request): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'cross-site';
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}
const FORWARD_REQUEST = ['content-type', 'accept', 'x-request-id', 'x-graph-simulate-down', 'x-ask-model'];

/**
 * Ask runs up to three model calls with a 20 s budget and answers from prepared answers when
 * that runs out, so the proxy must wait longer than the API's budget. Undefined = the default.
 */
export const timeoutFor = (segments: string[]): number | undefined => (segments[0] === 'v1' && segments[1] === 'ask' ? 30_000 : undefined);
const FORWARD_RESPONSE = ['content-type', 'content-disposition', 'cache-control', 'x-graph-source', 'x-request-id'];

const problem = (status: number, slug: string, title: string, detail: string) =>
  new Response(JSON.stringify({ type: `https://procurement.dev/problems/${slug}`, title, status, detail }), {
    status,
    headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' },
  });

/**
 * Forward a browser request for /api/<path> to the Node API, adding the
 * server-side API key. Only /v1 paths are reachable. An unreachable or slow
 * API becomes a 503 problem the UI can show as "Backend unreachable".
 */
export async function proxyApi(request: Request, segments: string[], opts: ApiProxyOptions): Promise<Response> {
  if (segments[0] !== 'v1' || !segments.every((s) => SEGMENT.test(s) && s !== '..' && s !== '.')) {
    return problem(404, 'not-found', 'Not found', 'No such API route');
  }
  if (!opts.apiKey) return problem(500, 'misconfigured', 'Server misconfigured', 'API_KEY is not set on the web server');
  if (crossSiteWrite(request)) return problem(403, 'cross-site', 'Cross-site request refused', 'Changes must come from this site');
  const search = new URL(request.url).search;
  const target = `${opts.apiUrl.replace(/\/$/, '')}/${segments.map(encodeURIComponent).join('/')}${search}`;
  const headers = new Headers();
  for (const h of FORWARD_REQUEST) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('x-api-key', opts.apiKey);
  const init: RequestInit = { method: request.method, headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = await request.arrayBuffer();

  let res: Response;
  try {
    res = await opts.fetchImpl(target, init);
  } catch {
    return problem(503, 'unreachable', 'Backend unreachable', 'The API did not answer. It may be starting up or down.');
  }
  const out = new Headers({ 'cache-control': 'no-store' });
  for (const h of FORWARD_RESPONSE) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(res.status === 204 ? null : await res.arrayBuffer(), { status: res.status, headers: out });
}
