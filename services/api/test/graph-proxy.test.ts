import { describe, expect, it, vi } from 'vitest';
import snapshotJson from '../data/graph-snapshot.json' with { type: 'json' };
import { proxyGraph, type ProxyOptions } from '../src/modules/graph/proxy.js';
import type { Snapshot } from '../src/modules/graph/types.js';

// Moved from apps/web/lib/graph/proxy.test.ts.

const snapshot = snapshotJson as unknown as Snapshot;

function options(fetchImpl: ProxyOptions['fetchImpl'], extra: Partial<ProxyOptions> = {}): ProxyOptions {
  return { serviceUrl: 'http://graph:8000', apiKey: 'k', fetchImpl, snapshot, timeoutMs: 50, ...extra };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = (r: Response) => r.json() as Promise<any>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('proxyGraph', () => {
  it('forwards to /v1 with the API key and wraps live data', async () => {
    const fetchImpl = vi.fn(async () => json(200, { focus: 'C1', nodes: [], edges: [] }));
    const res = await proxyGraph(new Request('http://api/v1/graph/graph?focus=C1&hops=2'), ['graph'], options(fetchImpl));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ source: 'live', data: { focus: 'C1', nodes: [], edges: [] } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://graph:8000/v1/graph?focus=C1&hops=2');
    expect(new Headers(init.headers).get('x-api-key')).toBe('k');
  });

  it('maps health to the unversioned path', async () => {
    const fetchImpl = vi.fn(async () => json(200, { status: 'ok' }));
    await proxyGraph(new Request('http://api/v1/graph/health'), ['health'], options(fetchImpl));
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('http://graph:8000/health');
  });

  it.each([
    ['401', async () => json(401, { detail: 'Missing or invalid API key' })],
    ['500', async () => json(500, { detail: 'boom' })],
    ['network error', async () => { throw new TypeError('fetch failed'); }],
  ])('falls back to the snapshot on %s', async (_label, impl) => {
    const res = await proxyGraph(new Request('http://api/v1/graph/graph?focus=C1'), ['graph'], options(vi.fn(impl)));
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.source).toBe('snapshot');
    expect(b.data.focus).toBe('C1');
  });

  it('falls back on timeout', async () => {
    const slow: ProxyOptions['fetchImpl'] = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError'))));
    const res = await proxyGraph(new Request('http://api/v1/graph/analytics'), ['analytics'], options(slow, { timeoutMs: 20 }));
    expect((await body(res)).source).toBe('snapshot');
  });

  it('passes 404 and 422 through as live errors', async () => {
    const r404 = await proxyGraph(new Request('http://api/v1/graph/nodes/x'), ['nodes', 'x'], options(vi.fn(async () => json(404, { detail: 'Unknown node' }))));
    expect(r404.status).toBe(404);
    expect(await body(r404)).toEqual({ source: 'live', error: 'Unknown node' });
    const r422 = await proxyGraph(
      new Request('http://api/v1/graph/suppliers/resolve', { method: 'POST', body: '{"names":[]}' }),
      ['suppliers', 'resolve'],
      options(vi.fn(async () => json(422, { detail: [{ msg: 'List should have at least 1 item' }] }))),
    );
    expect(r422.status).toBe(422);
    expect((await body(r422)).error).toBe('List should have at least 1 item');
  });

  it('forwards POST bodies', async () => {
    const fetchImpl = vi.fn(async () => json(200, []));
    await proxyGraph(
      new Request('http://api/v1/graph/suppliers/resolve', { method: 'POST', body: '{"names":["a"]}' }),
      ['suppliers', 'resolve'],
      options(fetchImpl),
    );
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"names":["a"]}');
  });

  it('uses the snapshot when the service is simulated down', async () => {
    const fetchImpl = vi.fn();
    const res = await proxyGraph(new Request('http://api/v1/graph/suppliers/resolve', { method: 'POST', body: '{}' }), ['suppliers', 'resolve'], options(fetchImpl, { simulateDown: true }));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
    expect(await body(res)).toEqual({ source: 'snapshot', error: 'Supplier resolution needs the live graph service' });
  });

  it('rejects path segments that try to escape the API', async () => {
    const fetchImpl = vi.fn();
    const res = await proxyGraph(new Request('http://api/v1/graph/x'), ['..', 'admin'], options(fetchImpl));
    expect(res.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('proxyGraph request ids', () => {
  it('forwards the request id to the graph service', async () => {
    const fetchImpl = vi.fn(async () => json(200, { status: 'ok' }));
    await proxyGraph(new Request('http://api/v1/graph/health'), ['health'], options(fetchImpl, { requestId: 'rid-1' }));
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('x-request-id')).toBe('rid-1');
  });
});
