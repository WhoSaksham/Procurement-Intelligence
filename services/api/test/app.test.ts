import { Router } from 'express';
import { describe, expect, it } from 'vitest';
import { testApp } from './helpers.js';

const PROBLEM = /application\/problem\+json/;

describe('app skeleton', () => {
  it('GET /health is open', async () => {
    const { raw } = testApp();
    const res = await raw.get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('a /v1 route without a key is a 401 problem', async () => {
    const { raw } = testApp();
    const res = await raw.get('/v1/anything');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(PROBLEM);
    expect(res.body.type).toMatch(/\/unauthorized$/);
  });

  it('a wrong key is a 401 problem', async () => {
    const { raw } = testApp();
    const res = await raw.get('/v1/anything').set('X-API-Key', 'nope');
    expect(res.status).toBe(401);
  });

  it('an unknown /v1 route with a key is a 404 problem', async () => {
    const { api } = testApp();
    const res = await api.get('/v1/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(PROBLEM);
    expect(res.body.type).toMatch(/\/not-found$/);
    expect(res.body.status).toBe(404);
    expect(res.body.instance).toBe('/v1/nope');
  });

  it('echoes an incoming x-request-id into the header and the problem body', async () => {
    const { api } = testApp();
    const res = await api.get('/v1/nope').set('x-request-id', 'abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
    expect(res.body.requestId).toBe('abc-123');
  });

  it('generates a UUID request id when none is sent', async () => {
    const { raw } = testApp();
    const res = await raw.get('/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('a plain Error becomes a 500 internal problem without a stack', async () => {
    const boom = Router().get('/v1/boom', () => {
      throw new Error('secret detail');
    });
    const { api } = testApp({ routers: [boom] });
    const res = await api.get('/v1/boom');
    expect(res.status).toBe(500);
    expect(res.body.type).toMatch(/\/internal$/);
    expect(JSON.stringify(res.body)).not.toMatch(/secret detail|at /);
  });

  it('malformed JSON is a 400 validation problem', async () => {
    const echo = Router().post('/v1/echo', (req, res) => {
      res.json(req.body);
    });
    const { api } = testApp({ routers: [echo] });
    const res = await api.post('/v1/echo').set('content-type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.type).toMatch(/\/validation$/);
  });

  it('/docs is off unless exposeDocs is set', async () => {
    expect((await testApp().raw.get('/docs')).status).toBe(404);
    expect((await testApp().raw.get('/openapi.json')).status).toBe(404);
    const on = testApp({}, { exposeDocs: true });
    expect((await on.raw.get('/docs')).status).toBe(200);
    expect((await on.raw.get('/openapi.json')).body.openapi).toMatch(/^3\.1/);
  });

  it('never writes the API key to the logs', async () => {
    const lines: string[] = [];
    const { raw } = testApp({ logStream: { write: (l: string) => void lines.push(l) } }, { logLevel: 'info' });
    await raw.get('/v1/nope').set('X-API-Key', 'SECRET-KEY-123');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('')).not.toContain('SECRET-KEY-123');
  });

  it('GET /ready reports mongo up and graph down when only mongo is reachable', async () => {
    const { raw } = testApp({ dbReady: () => true, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
    const res = await raw.get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mongo: 'up', graph: 'down' });
  });

  it('GET /ready is 503 when mongo is down', async () => {
    const { raw } = testApp({ dbReady: () => false, fetchImpl: async () => new Response('{}', { status: 200 }) });
    const res = await raw.get('/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ mongo: 'down', graph: 'up' });
  });
});
