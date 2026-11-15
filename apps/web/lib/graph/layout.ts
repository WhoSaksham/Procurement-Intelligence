import type { GraphNode } from './types';

export interface Point {
  x: number;
  y: number;
}

const PAD_X = 90;
const PAD_Y = 36;
const ROW_GAP = 62;

/** Node radius from normalised centrality (0–1). */
export const nodeRadius = (centrality: number) => 8 + 10 * Math.max(0, Math.min(1, centrality));

/** Canvas height that fits the busiest column without crowding. */
export function canvasHeight(nodes: GraphNode[]): number {
  const counts = [0, 0, 0, 0];
  for (const n of nodes) counts[n.column] += 1;
  return Math.max(420, Math.max(...counts) * ROW_GAP + PAD_Y * 2);
}

/**
 * Deterministic column layout: x by entity-type column (context → projects →
 * contracts and documents → suppliers and lessons), y spread evenly by the
 * service's row order within each column.
 */
export function layout(nodes: GraphNode[], width: number, height: number): Record<string, Point> {
  const cols: GraphNode[][] = [[], [], [], []];
  for (const n of nodes) cols[n.column].push(n);
  const step = (width - PAD_X * 2) / 3;
  const pos: Record<string, Point> = {};
  cols.forEach((col, c) => {
    const sorted = [...col].sort((a, b) => a.row - b.row || a.id.localeCompare(b.id));
    const span = (height - PAD_Y * 2) / Math.max(1, sorted.length);
    sorted.forEach((n, i) => {
      pos[n.id] = { x: PAD_X + c * step, y: PAD_Y + span * (i + 0.5) };
    });
  });
  return pos;
}
