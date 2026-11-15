// Regenerate the web app's offline snapshot and API types from a running graph service.
//   GRAPH_SERVICE_URL=http://localhost:8000 GRAPH_API_KEY=dev-key node scripts/snapshot.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.GRAPH_SERVICE_URL ?? 'http://localhost:8000';
const key = process.env.GRAPH_API_KEY ?? 'dev-key';

async function get(p) {
  const res = await fetch(`${base}${p}`, { headers: { 'X-API-Key': key } });
  if (!res.ok) throw new Error(`${p} → ${res.status}`);
  return res.json();
}

const [health, full, clusters, analytics] = await Promise.all([
  get('/health'),
  get('/v1/full'),
  get('/v1/suppliers/clusters'),
  get('/v1/analytics'),
]);
const nodes = Object.fromEntries(
  await Promise.all(full.nodes.map(async (n) => [n.id, await get(`/v1/nodes/${encodeURIComponent(n.id)}`)])),
);
const snapshot = { generated_at: new Date().toISOString(), health, full, nodes, clusters, analytics };
const out = path.join(root, 'apps/web/data/graph-snapshot.json');
writeFileSync(out, JSON.stringify(snapshot, null, 1) + '\n');
console.log(`snapshot: ${full.nodes.length} nodes, ${full.edges.length} edges → ${path.relative(root, out)}`);

execFileSync('uv', ['run', '--directory', 'services/graph', 'python', 'scripts/export_openapi.py'], { cwd: root, stdio: 'inherit' });
execFileSync('npx', ['openapi-typescript', '../../services/graph/openapi.json', '-o', 'lib/graph/schema.d.ts'], {
  cwd: path.join(root, 'apps/web'),
  stdio: 'inherit',
});
