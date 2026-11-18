import { describe, expect, it, vi } from 'vitest';
import { proxyApi, type ApiProxyOptions } from '@/lib/api/proxy';

const opts = (fetchImpl: ApiProxyOptions['fetchImpl'], extra: Partial<ApiProxyOptions> = {}): ApiProxyOptions => ({
  apiUrl: 'http://api:4000',
  apiKey: 'k',
  fetchImpl,
  timeoutMs: 50,
  ...extra,
});

const ok = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });

describe('proxyApi', () => {
  it('forwards method, body, query and the API key', async () => {
    const fetchImpl = vi.fn(async () => ok({ id: 'p1' }));
    const req = new Request('http://web/api/v1/packages/p1?x=1', { method: 'PATCH', body: '{"version":1}', headers: { 'content-type': 'application/json', 'x-request-id': 'r1' } });
    const res = await proxyApi(req, ['v1', 'packages', 'p1'], opts(fetchImpl));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'p1' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api:4000/v1/packages/p1?x=1');
    expect(init.method).toBe('PATCH');
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"version":1}');
    const h = new Headers(init.headers);
    expect(h.get('x-api-key')).toBe('k');
    expect(h.get('content-type')).toBe('application/json');
    expect(h.get('x-request-id')).toBe('r1');
  });

  it('does not forward a browser-supplied API key', async () => {
    const fetchImpl = vi.fn(async () => ok({}));
    await proxyApi(new Request('http://web/api/v1/reference', { headers: { 'x-api-key': 'evil' } }), ['v1', 'reference'], opts(fetchImpl));
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('x-api-key')).toBe('k');
  });

  it('passes status and selected headers through', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="a.json"', 'x-graph-source': 'snapshot', 'set-cookie': 'x=1' } }),
    );
    const res = await proxyApi(new Request('http://web/api/v1/packages/p1/export'), ['v1', 'packages', 'p1', 'export'], opts(fetchImpl));
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="a.json"');
    expect(res.headers.get('x-graph-source')).toBe('snapshot');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('passes API problems through unchanged', async () => {
    const problem = { type: 'https://procurement.dev/problems/version-conflict', status: 409 };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(problem), { status: 409, headers: { 'content-type': 'application/problem+json' } }));
    const res = await proxyApi(new Request('http://web/api/v1/packages/p1', { method: 'PATCH', body: '{}' }), ['v1', 'packages', 'p1'], opts(fetchImpl));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(problem);
  });

  it('rejects .. segments and paths outside /v1 with 404', async () => {
    const fetchImpl = vi.fn();
    expect((await proxyApi(new Request('http://web/api/x'), ['v1', '..', 'admin'], opts(fetchImpl))).status).toBe(404);
    expect((await proxyApi(new Request('http://web/api/ready'), ['ready'], opts(fetchImpl))).status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps an unreachable API to a 503 problem', async () => {
    const res = await proxyApi(new Request('http://web/api/v1/reference'), ['v1', 'reference'], opts(async () => { throw new TypeError('fetch failed'); }));
    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toMatch(/problem\+json/);
    expect((await res.json()).type).toMatch(/unreachable$/);
  });

  it('maps a timeout to a 503 problem', async () => {
    const slow: ApiProxyOptions['fetchImpl'] = (_u, init) =>
      new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('t', 'TimeoutError'))));
    const res = await proxyApi(new Request('http://web/api/v1/reference'), ['v1', 'reference'], opts(slow, { timeoutMs: 10 }));
    expect(res.status).toBe(503);
  });

  it('refuses cross-site writes', async () => {
    const fetchImpl = vi.fn(async () => ok({}));
    const viaFetchMetadata = new Request('http://web/api/v1/learn/events/next', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } });
    expect((await proxyApi(viaFetchMetadata, ['v1', 'learn', 'events', 'next'], opts(fetchImpl))).status).toBe(403);
    const viaOrigin = new Request('http://web/api/v1/packages/import', { method: 'POST', body: '{}', headers: { origin: 'https://evil.example', 'content-type': 'text/plain' } });
    expect((await proxyApi(viaOrigin, ['v1', 'packages', 'import'], opts(fetchImpl))).status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('allows same-origin writes and cross-site reads', async () => {
    const fetchImpl = vi.fn(async () => ok({}));
    const sameOrigin = new Request('http://web/api/v1/learn/events/next', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', origin: 'http://web' } });
    expect((await proxyApi(sameOrigin, ['v1', 'learn', 'events', 'next'], opts(fetchImpl))).status).toBe(200);
    const crossRead = new Request('http://web/api/v1/reference', { headers: { 'sec-fetch-site': 'cross-site' } });
    expect((await proxyApi(crossRead, ['v1', 'reference'], opts(fetchImpl))).status).toBe(200);
    const serverSide = new Request('http://web/api/v1/packages', { method: 'POST', body: '{}' });
    expect((await proxyApi(serverSide, ['v1', 'packages'], opts(fetchImpl))).status).toBe(200);
  });

  it('fails closed without an API key instead of using a default', async () => {
    const fetchImpl = vi.fn(async () => ok({}));
    const res = await proxyApi(new Request('http://web/api/v1/reference'), ['v1', 'reference'], opts(fetchImpl, { apiKey: undefined }));
    expect(res.status).toBe(500);
    expect((await res.json()).type).toMatch(/misconfigured$/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

