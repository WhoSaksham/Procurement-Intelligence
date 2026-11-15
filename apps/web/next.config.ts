import path from 'node:path';
import type { NextConfig } from 'next';

const root = path.join(__dirname);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Standalone output only for the Docker image; `next start` serves the normal build.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: root,
  // The root URL opens the Package view. A config redirect avoids rendering a
  // page that only redirects (which fails Cache Components' prerender check).
  async redirects() {
    return [{ source: '/', destination: '/package', permanent: false }];
  },
  turbopack: {
    root,
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
