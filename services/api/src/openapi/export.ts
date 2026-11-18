// `npm run openapi [-- --check]`: write services/api/openapi.json from the route registry.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleRouters } from '../app.js';
import { openApiDocument } from './registry.js';

export const OPENAPI_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../openapi.json');

export function renderOpenApi(): string {
  moduleRouters();
  return JSON.stringify(openApiDocument(), null, 2) + '\n';
}

export function staleOpenApi(file = OPENAPI_FILE): boolean {
  try {
    return readFileSync(file, 'utf8') !== renderOpenApi();
  } catch {
    return true;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--check')) {
    if (staleOpenApi()) {
      console.error('openapi.json is out of date. Run npm run openapi.');
      process.exit(1);
    }
    console.log('openapi.json is up to date');
  } else {
    writeFileSync(OPENAPI_FILE, renderOpenApi());
    console.log(`Wrote ${OPENAPI_FILE}`);
  }
}
