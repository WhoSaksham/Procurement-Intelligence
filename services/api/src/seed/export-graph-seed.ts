// `npm run export:graph-seed [-- --check]`: write the graph service's test fixture
// (services/graph/tests/fixtures/seed) from the same derivation the seeder uses.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { buildGraphSeed } from './derive-graph.js';
import { loadSeedFiles } from './files.js';

export const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../graph/tests/fixtures/seed');

/** File name → contents the fixture should hold. */
export function graphFixture(seedDir: string): Record<string, string> {
  const g = buildGraphSeed(loadSeedFiles(seedDir));
  const out = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
  return {
    'nodes.json': out(g.nodes),
    'edges.json': out(g.edges),
    'supplier_registry.json': out(g.supplierRegistry),
    'suppliers_raw.json': out(g.suppliersRaw),
  };
}

/** Names of fixture files that differ from what the seed produces. */
export function staleFixtureFiles(seedDir: string, dir = FIXTURE_DIR): string[] {
  return Object.entries(graphFixture(seedDir))
    .filter(([name, body]) => {
      try {
        return readFileSync(path.join(dir, name), 'utf8') !== body;
      } catch {
        return true;
      }
    })
    .map(([name]) => name);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { seedDir } = loadConfig();
  if (process.argv.includes('--check')) {
    const stale = staleFixtureFiles(seedDir);
    if (stale.length) {
      console.error(`Graph fixture is out of date: ${stale.join(', ')}. Run npm run export:graph-seed.`);
      process.exit(1);
    }
    console.log('Graph fixture is up to date');
  } else {
    mkdirSync(FIXTURE_DIR, { recursive: true });
    for (const [name, body] of Object.entries(graphFixture(seedDir))) writeFileSync(path.join(FIXTURE_DIR, name), body);
    console.log(`Wrote ${FIXTURE_DIR}`);
  }
}
