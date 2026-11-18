import { readFileSync } from 'node:fs';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Config } from '../../config.js';
import { route } from '../../openapi/route.js';
import { proxyGraph } from './proxy.js';
import type { Snapshot } from './types.js';

const SNAPSHOT_FILE = new URL('../../../data/graph-snapshot.json', import.meta.url);

let snapshot: Snapshot | undefined;
const loadSnapshot = (): Snapshot => (snapshot ??= JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')) as Snapshot);

const Envelope = z
  .union([
    z.object({ source: z.enum(['live', 'snapshot']), data: z.unknown() }),
    z.object({ source: z.enum(['live', 'snapshot']), error: z.string() }),
  ])
  .openapi('GraphEnvelope');

/**
 * The graph service behind this API: `/v1/graph/<path>` → graph service `/v1/<path>`
 * (`health` → `/health`), answered from the committed snapshot when it is down.
 */
export function graphRouter(config: Config, fetchImpl: typeof fetch): Router {
  const r = Router();

  const forward = async (req: Request, res: Response) => {
    // Segments after /v1/graph/, decoded the way the router decodes params.
    const segments = req.path
      .slice('/v1/graph/'.length)
      .split('/')
      .filter(Boolean)
      .map((s) => {
        try {
          return decodeURIComponent(s);
        } catch {
          return '..';
        }
      });
    const url = `http://api${req.originalUrl}`;
    const init: RequestInit = { method: req.method };
    if (req.method === 'POST') init.body = JSON.stringify(req.body ?? null);
    const simulateDown = config.graphDown || (config.allowSimulateDown && req.get('x-graph-simulate-down') === '1');
    const out = await proxyGraph(new Request(url, init), segments, {
      serviceUrl: config.graphServiceUrl,
      apiKey: config.graphApiKey,
      snapshot: loadSnapshot(),
      fetchImpl,
      simulateDown,
      requestId: req.requestId,
    });
    res.status(out.status);
    for (const h of ['content-type', 'cache-control', 'x-graph-source']) {
      const v = out.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.send(Buffer.from(await out.arrayBuffer()));
  };

  const ok = { 200: { description: 'Envelope with live or snapshot data', schema: Envelope } };
  const spec = (path: string, summary: string, request?: Parameters<typeof route>[1]['request']) => ({
    method: 'get' as const,
    path,
    summary,
    tags: ['graph'],
    request,
    responses: ok,
  });
  // Documented paths; one catch-all handler serves them all.
  route(r, spec('/v1/graph/health', 'Graph service health (snapshot when down)'), forward);
  route(r, spec('/v1/graph/graph', 'Neighbourhood of a node', { query: z.object({ focus: z.string().optional(), hops: z.coerce.number().int().min(1).max(4).optional() }) }), forward);
  route(r, spec('/v1/graph/full', 'Whole graph'), forward);
  route(r, spec('/v1/graph/nodes/:id', 'Node, its links and provenance', { params: z.object({ id: z.string() }) }), forward);
  route(r, spec('/v1/graph/suppliers/clusters', 'Canonical suppliers and their name variants'), forward);
  route(r, spec('/v1/graph/analytics', 'Centrality ranking and communities'), forward);
  route(
    r,
    {
      method: 'post',
      path: '/v1/graph/suppliers/resolve',
      summary: 'Resolve supplier names (live service only)',
      tags: ['graph'],
      request: { body: { content: { 'application/json': { schema: z.object({ names: z.array(z.string()) }) } } } },
      responses: ok,
      problems: [422, 503],
    },
    forward,
  );
  r.get('/v1/graph/*path', forward);
  return r;
}
