import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 120_000,
    env: { NODE_ENV: 'test' },
  },
});
