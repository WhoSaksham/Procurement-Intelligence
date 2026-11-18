import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { startServer } from '../src/start.js';
import { testConfig, TEST_KEY } from './helpers.js';

describe('startServer', () => {
  let stop: (() => Promise<void>) | undefined;
  afterAll(async () => {
    await stop?.();
  });

  it('connects, seeds, then serves', async () => {
    const url = new URL(inject('mongoUri'));
    url.pathname = `/start-${randomUUID().slice(0, 8)}`;
    const started = await startServer(testConfig({ mongoUrl: url.toString(), port: 0 }));
    stop = started.stop;
    const { port } = started.server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    expect((await fetch(`${base}/ready`)).status).toBe(200);
    const ex = await fetch(`${base}/v1/packages/example`, { headers: { 'X-API-Key': TEST_KEY } });
    expect(ex.status).toBe(200);
    expect(((await ex.json()) as { example: boolean }).example).toBe(true);
  });
});
