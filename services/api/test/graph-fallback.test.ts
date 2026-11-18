import { describe, expect, it } from 'vitest';
import snapshotJson from '../data/graph-snapshot.json' with { type: 'json' };
import { answerFromSnapshot } from '../src/modules/graph/fallback.js';
import type { GraphResponse, NodeDetail, Snapshot } from '../src/modules/graph/types.js';

// Moved from apps/web/lib/graph/fallback.test.ts.

const snapshot = snapshotJson as unknown as Snapshot;
const q = (s = '') => new URLSearchParams(s);

describe('answerFromSnapshot', () => {
  it('computes the focus subgraph from the full graph', () => {
    const r = answerFromSnapshot('graph', q('focus=C1&hops=1'), snapshot);
    expect(r.status).toBe(200);
    const g = r.data as GraphResponse;
    const ids = new Set(g.nodes.map((n) => n.id));
    expect(g.focus).toBe('C1');
    expect(ids.has('SUP-004417')).toBe(true);
    expect(ids.has('P171204')).toBe(true);
    expect(ids.has('KE')).toBe(false); // two hops away
    expect(g.edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true);
  });

  it('defaults to the closest precedent at two hops', () => {
    const g = answerFromSnapshot('graph', q(), snapshot).data as GraphResponse;
    expect(g.focus).toBe('C1');
    expect(g.nodes.some((n) => n.id === 'KE')).toBe(true);
  });

  it('returns 404 for an unknown focus or node', () => {
    expect(answerFromSnapshot('graph', q('focus=nope'), snapshot)).toEqual({ status: 404, data: { detail: 'Unknown node' } });
    expect(answerFromSnapshot('nodes/nope', q(), snapshot).status).toBe(404);
  });

  it('rejects hops outside 1–4', () => {
    expect(answerFromSnapshot('graph', q('hops=0'), snapshot).status).toBe(422);
    expect(answerFromSnapshot('graph', q('hops=9'), snapshot).status).toBe(422);
  });

  it('serves node detail, clusters, analytics and health', () => {
    expect((answerFromSnapshot('nodes/SUP-004417', q(), snapshot).data as NodeDetail).node.label).toBe('Meridian Roadworks Ltd');
    expect(answerFromSnapshot('suppliers/clusters', q(), snapshot).status).toBe(200);
    expect(answerFromSnapshot('analytics', q(), snapshot).status).toBe(200);
    expect(answerFromSnapshot('health', q(), snapshot).status).toBe(200);
  });

  it('cannot resolve new names offline', () => {
    expect(answerFromSnapshot('suppliers/resolve', q(), snapshot)).toEqual({
      status: 503,
      data: { detail: 'Supplier resolution needs the live graph service' },
    });
  });

  it('returns 404 for unknown paths', () => {
    expect(answerFromSnapshot('drop/tables', q(), snapshot).status).toBe(404);
  });
});
