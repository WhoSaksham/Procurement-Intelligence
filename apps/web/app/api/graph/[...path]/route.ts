import type { NextRequest } from 'next/server';
import snapshot from '@/data/graph-snapshot.json';
import { proxyGraph } from '@/lib/graph/proxy';
import type { Snapshot } from '@/lib/graph/types';

// Server-side only: the browser calls /api/graph/*, never the graph service.
// The service URL and API key stay on the server.
function options(request: NextRequest) {
  return {
    serviceUrl: process.env.GRAPH_SERVICE_URL ?? 'http://localhost:8000',
    apiKey: process.env.GRAPH_API_KEY ?? 'dev-key',
    snapshot: snapshot as unknown as Snapshot,
    fetchImpl: fetch,
    // End-to-end tests can simulate an outage; ignored outside the test server.
    simulateDown: process.env.E2E === '1' && request.headers.get('x-graph-simulate-down') === '1',
  };
}

export async function GET(request: NextRequest, ctx: RouteContext<'/api/graph/[...path]'>) {
  const { path } = await ctx.params;
  return proxyGraph(request, path, options(request));
}

export async function POST(request: NextRequest, ctx: RouteContext<'/api/graph/[...path]'>) {
  const { path } = await ctx.params;
  return proxyGraph(request, path, options(request));
}
