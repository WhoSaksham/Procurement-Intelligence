import { defineConfig, devices } from '@playwright/test';

// E2E_DEV=1 runs against `next dev`, where React reports hydration mismatches
// (production builds stay silent about them). Used by e2e/hydration.spec.ts.
const dev = process.env.E2E_DEV === '1';
const PORT = dev ? 3000 : 3200; // dev reuses a running `next dev`; tests never collide with it
// In CI, MongoDB, the API and the graph service run from Docker Compose and are reused.
const external = process.env.API_EXTERNAL === '1';
// Locally the stack gets its own ports and database, so a dev stack on :4000/:8000 is left alone.
const API_PORT = external ? 4000 : 4100;
const GRAPH_PORT = 8100;
const API_KEY = process.env.API_KEY ?? 'dev-key';
const GRAPH_API_KEY = process.env.GRAPH_API_KEY ?? 'dev-key';
const MONGO = 'mongodb://localhost:27017';
const DB = 'procurement-e2e';

export default defineConfig({
  testDir: './e2e',
  ...(dev ? { testMatch: /hydration\.spec\.ts/ } : { testIgnore: /hydration\.spec\.ts/ }),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  webServer: [
    ...(external
      ? []
      : [
          {
            name: 'mongo',
            command: 'docker compose -f ../../docker-compose.yml up mongo',
            port: 27017,
            reuseExistingServer: true,
            timeout: 180_000,
          },
          {
            name: 'api',
            // Reseed the e2e database so every run starts from the seed.
            command: 'npm run seed -- --force && npx tsx src/server.ts',
            cwd: '../../services/api',
            url: `http://localhost:${API_PORT}/ready`,
            env: {
              PORT: String(API_PORT),
              MONGO_URL: `${MONGO}/${DB}`,
              API_KEY,
              GRAPH_SERVICE_URL: `http://localhost:${GRAPH_PORT}`,
              GRAPH_API_KEY,
              E2E: '1',
              LOG_LEVEL: 'warn',
              // Never reach a real model from tests, even if the shell has a key.
              GEMINI_API_KEY: '',
              LANGSMITH_TRACING: '',
            },
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
          {
            name: 'graph',
            // The graph service reads the collections the API seeds, so wait for the API first.
            command: `sh -c 'until curl -sf http://localhost:${API_PORT}/ready >/dev/null; do sleep 1; done; exec uv run --directory ../../services/graph uvicorn app.main:app --port ${GRAPH_PORT}'`,
            url: `http://localhost:${GRAPH_PORT}/health`,
            env: { GRAPH_API_KEY, MONGO_URL: MONGO, MONGO_DB: DB },
            reuseExistingServer: !process.env.CI,
            timeout: 180_000,
          },
        ]),
    {
      name: 'web',
      command: dev ? `npx next dev --port ${PORT}` : `npm run build && npm run start -- --port ${PORT}`,
      url: `http://localhost:${PORT}/package`,
      env: {
        API_URL: `http://localhost:${API_PORT}`,
        API_KEY,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
