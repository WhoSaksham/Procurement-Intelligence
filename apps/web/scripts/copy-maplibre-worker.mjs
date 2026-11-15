// MapLibre runs its tile parsing in a Web Worker. Serve the worker file from
// public/ so it loads the same way in dev, production and Docker builds.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pkg = require('maplibre-gl/package.json');
const src = path.join(path.dirname(require.resolve('maplibre-gl/package.json')), 'dist/maplibre-gl-worker.mjs');
const dir = path.join(import.meta.dirname, '..', 'public', 'vendor');
mkdirSync(dir, { recursive: true });
copyFileSync(src, path.join(dir, `maplibre-gl-worker-${pkg.version}.mjs`));
console.log(`maplibre worker ${pkg.version} → public/vendor`);
