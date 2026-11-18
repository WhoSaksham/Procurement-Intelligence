import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { canvasHeight, layout, nodeRadius } from '@/lib/graph/layout';
import type { Snapshot } from '@/lib/graph/types';

// The API's offline snapshot is a realistic graph to lay out (the whole graph).
const snapshot = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../services/api/data/graph-snapshot.json'), 'utf8')) as Snapshot;
const g = snapshot.full;

describe('graph layout', () => {
  it('is deterministic', () => {
    expect(layout(g.nodes, 900, 500)).toEqual(layout([...g.nodes].reverse(), 900, 500));
  });

  it('keeps every node inside the canvas', () => {
    const pos = layout(g.nodes, 900, 500);
    for (const n of g.nodes) {
      expect(pos[n.id].x).toBeGreaterThanOrEqual(0);
      expect(pos[n.id].x).toBeLessThanOrEqual(900);
      expect(pos[n.id].y).toBeGreaterThanOrEqual(0);
      expect(pos[n.id].y).toBeLessThanOrEqual(500);
    }
  });

  it('places lower columns further left and spreads rows within a column', () => {
    const pos = layout(g.nodes, 900, 500);
    const country = g.nodes.find((n) => n.column === 0)!;
    const supplier = g.nodes.find((n) => n.column === 3)!;
    expect(pos[country.id].x).toBeLessThan(pos[supplier.id].x);
    const col3 = g.nodes.filter((n) => n.column === 3).map((n) => pos[n.id].y);
    expect(new Set(col3).size).toBe(col3.length);
  });

  it('grows the canvas with the busiest column and sizes nodes by centrality', () => {
    expect(canvasHeight(g.nodes)).toBeGreaterThanOrEqual(420);
    expect(nodeRadius(1)).toBeGreaterThan(nodeRadius(0));
    expect(nodeRadius(0)).toBe(8);
    expect(nodeRadius(1)).toBe(18);
  });
});
