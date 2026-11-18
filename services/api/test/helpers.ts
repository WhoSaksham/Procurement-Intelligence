import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import supertest from 'supertest';
import { afterAll, beforeAll, inject } from 'vitest';
import { createApp, type AppDeps } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { connectDb, disconnectDb } from '../src/db.js';

export const TEST_KEY = 'test-key';

export const testConfig = (overrides: Partial<Config> = {}): Config => ({
  ...loadConfig({}),
  apiKey: TEST_KEY,
  logLevel: 'silent',
  ...overrides,
});

/** Connect mongoose to a fresh database on the shared in-memory server for this test file. */
export function useTestDb(): { uri: () => string } {
  let uri = '';
  beforeAll(async () => {
    const base = new URL(inject('mongoUri'));
    base.pathname = `/t-${randomUUID().slice(0, 8)}`;
    uri = base.toString();
    await connectDb(uri);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await disconnectDb();
  });
  return { uri: () => uri };
}

/** The app plus a supertest agent that sends the API key. */
export function testApp(deps: Partial<AppDeps> = {}, config: Partial<Config> = {}) {
  const app = createApp({ config: testConfig(config), ...deps });
  const request = supertest(app);
  const withKey = {
    get: (p: string) => request.get(p).set('X-API-Key', TEST_KEY),
    post: (p: string) => request.post(p).set('X-API-Key', TEST_KEY),
    put: (p: string) => request.put(p).set('X-API-Key', TEST_KEY),
    patch: (p: string) => request.patch(p).set('X-API-Key', TEST_KEY),
    delete: (p: string) => request.delete(p).set('X-API-Key', TEST_KEY),
  };
  return { app, raw: request, api: withKey };
}
