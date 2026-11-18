import type { GraphResponse, Snapshot } from './types.js';

export const DEFAULT_FOCUS = 'C1';
export const DEFAULT_HOPS = 2;
export const RESOLVE_OFFLINE = 'Supplier resolution needs the live graph service';

export interface Answer {
  status: number;
  data: unknown;
}

/** Breadth-first neighbourhood, the same rule the service uses. */
export function subgraph(full: GraphResponse, focus: string, hops: number): GraphResponse | null {
  if (!full.nodes.some((n) => n.id === focus)) return null;
  const adj = new Map<string, Set<string>>();
  for (const e of full.edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set());
    if (!adj.has(e.target)) adj.set(e.target, new Set());
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }
  const seen = new Set([focus]);
  let frontier = [focus];
  for (let d = 0; d < hops; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        next.push(nb);
      }
    }
    frontier = next;
  }
  return {
    focus,
    nodes: full.nodes.filter((n) => seen.has(n.id)),
    edges: full.edges.filter((e) => seen.has(e.source) && seen.has(e.target)),
  };
}

/**
 * Answer a graph API request from the committed snapshot, used when the live
 * service is unreachable or failing. Mirrors the service's status codes.
 */
export function answerFromSnapshot(path: string, query: URLSearchParams, snapshot: Snapshot): Answer {
  const unknown = { status: 404, data: { detail: 'Unknown node' } };
  if (path === 'health') return { status: 200, data: snapshot.health };
  if (path === 'full') return { status: 200, data: snapshot.full };
  if (path === 'analytics') return { status: 200, data: snapshot.analytics };
  if (path === 'suppliers/clusters') return { status: 200, data: snapshot.clusters };
  if (path === 'suppliers/resolve') return { status: 503, data: { detail: RESOLVE_OFFLINE } };
  if (path === 'graph') {
    const hops = Number(query.get('hops') ?? DEFAULT_HOPS);
    if (!Number.isInteger(hops) || hops < 1 || hops > 4) return { status: 422, data: { detail: 'hops must be between 1 and 4' } };
    const g = subgraph(snapshot.full, query.get('focus') ?? DEFAULT_FOCUS, hops);
    return g ? { status: 200, data: g } : unknown;
  }
  if (path.startsWith('nodes/')) {
    const detail = snapshot.nodes[decodeURIComponent(path.slice('nodes/'.length))];
    return detail ? { status: 200, data: detail } : unknown;
  }
  return { status: 404, data: { detail: 'Not found' } };
}
