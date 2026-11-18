import { describe, expect, it, vi } from 'vitest';
import { testApp } from './helpers.js';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('/v1/graph routes', () => {
  it('serves live graph data in the envelope with the source header', async () => {
    const fetchImpl = vi.fn(async () => json(200, { focus: 'C1', nodes: [], edges: [] }));
    const { api } = testApp({ fetchImpl }, { graphServiceUrl: 'http://graph:8000', graphApiKey: 'gk' });
    const res = await api.get('/v1/graph/graph?focus=C1&hops=2');
    expect(res.status).toBe(200);
    expect(res.headers['x-graph-source']).toBe('live');
    expect(res.body).toEqual({ source: 'live', data: { focus: 'C1', nodes: [], edges: [] } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://graph:8000/v1/graph?focus=C1&hops=2');
    expect(new Headers(init.headers).get('x-api-key')).toBe('gk');
  });

  it('falls back to the snapshot when the service is down', async () => {
    const { api } = testApp({ fetchImpl: async () => { throw new TypeError('fetch failed'); } });
    const res = await api.get('/v1/graph/nodes/C1');
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('snapshot');
    expect(res.body.data.node.id).toBe('C1');
  });

  it('forwards supplier resolution bodies', async () => {
    const fetchImpl = vi.fn(async () => json(200, []));
    const { api } = testApp({ fetchImpl });
    await api.post('/v1/graph/suppliers/resolve').send({ names: ['Meridian'] });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ names: ['Meridian'] });
  });

  it('E2E_GRAPH_DOWN answers every request from the snapshot', async () => {
    const fetchImpl = vi.fn();
    const { api } = testApp({ fetchImpl }, { graphDown: true });
    const res = await api.get('/v1/graph/health');
    expect(res.body.source).toBe('snapshot');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('honours the simulate-down header only when allowed', async () => {
    const fetchImpl = vi.fn(async () => json(200, { status: 'ok' }));
    const off = testApp({ fetchImpl });
    expect((await off.api.get('/v1/graph/health').set('x-graph-simulate-down', '1')).body.source).toBe('live');
    const on = testApp({ fetchImpl }, { allowSimulateDown: true });
    expect((await on.api.get('/v1/graph/health').set('x-graph-simulate-down', '1')).body.source).toBe('snapshot');
  });

  it('needs the API key', async () => {
    expect((await testApp().raw.get('/v1/graph/health')).status).toBe(401);
  });
});
