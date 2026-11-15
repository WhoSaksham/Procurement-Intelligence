import { defineConfig, devices } from '@playwright/test';

// E2E_DEV=1 runs against `next dev`, where React reports hydration mismatches
// (production builds stay silent about them). Used by e2e/hydration.spec.ts.
const dev = process.env.E2E_DEV === '1';
const PORT = dev ? 3000 : 3200; // dev reuses a running `next dev`; tests never collide with it
const GRAPH_PORT = 8000;
const API_KEY = process.env.GRAPH_API_KEY ?? 'dev-key';
// In CI the graph service runs from Docker Compose and is reused.
const external = process.env.GRAPH_EXTERNAL === '1';

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
            command: `uv run --directory ../../services/graph uvicorn app.main:app --port ${GRAPH_PORT}`,
            url: `http://localhost:${GRAPH_PORT}/health`,
            env: { GRAPH_API_KEY: API_KEY },
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ]),
    {
      command: dev ? `npx next dev --port ${PORT}` : `npm run build && npm run start -- --port ${PORT}`,
      url: `http://localhost:${PORT}/`,
      env: {
        GRAPH_SERVICE_URL: `http://localhost:${GRAPH_PORT}`,
        GRAPH_API_KEY: API_KEY,
        E2E: '1',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
