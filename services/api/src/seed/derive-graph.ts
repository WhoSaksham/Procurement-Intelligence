import type { Contract, Country, LayerId, Source } from '../modules/analysis/types.js';
import type { SeedFiles } from './files.js';

/** A node as the graph service's seed loader expects it (services/graph/app/seed.py `SeedNode`). */
export interface GraphNode {
  id: string;
  type: string;
  label: string;
  layer: LayerId;
  attrs: Record<string, string>;
  source_id: string;
  locator: string;
  column: number;
}

export interface GraphRef {
  collection: 'countries' | 'contracts' | 'sources';
  key: string;
}

/**
 * A node in `data/seed/graph/nodes.json`: either a complete graph-only node, or
 * a reference to a domain record plus the hand-written fields no record holds.
 */
export type SeedGraphNode =
  | GraphNode
  | { id: string; type: string; ref: GraphRef; column: number; label?: string; attrs?: Record<string, string>; source_id?: string; locator?: string };

export interface GraphLookup {
  countries: Map<string, Country>;
  contracts: Map<string, Contract>;
  sources: Map<string, Source>;
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

const shape = (n: GraphNode): GraphNode => ({
  id: n.id,
  type: n.type,
  label: n.label,
  layer: n.layer,
  attrs: n.attrs,
  source_id: n.source_id,
  locator: n.locator,
  column: n.column,
});

/** Fill reference nodes from their domain records. Throws on a reference to a missing record. */
export function deriveGraphNodes(nodes: SeedGraphNode[], lookup: GraphLookup): GraphNode[] {
  return nodes.map((n) => {
    if (!('ref' in n)) return shape(n);
    const { collection, key } = n.ref;
    const dangling = () => new Error(`Dangling graph ref: ${collection}/${key}`);
    const extra = n.attrs ?? {};
    if (collection === 'countries') {
      const c = lookup.countries.get(key);
      if (!c) throw dangling();
      return shape({
        id: n.id,
        type: n.type,
        label: n.label ?? c.name,
        layer: 'ledger',
        attrs: { 'CPIA public sector mgmt': c.cpia.toFixed(1), 'WGI regulatory quality': `${ordinal(c.rq)} pct`, FCV: c.fcv ? 'Yes' : 'No', ...extra },
        source_id: n.source_id ?? 'wgi1',
        locator: n.locator ?? 'CPIA and WGI indicators',
        column: n.column,
      });
    }
    if (collection === 'contracts') {
      const c = lookup.contracts.get(key);
      if (!c) throw dangling();
      return shape({
        id: n.id,
        type: n.type,
        label: n.label ?? `${c.id} ${c.title}`,
        layer: 'ledger',
        attrs: { Value: `US$${c.value}M`, Signed: c.signed, Progress: `${c.actual}% vs ${c.planned}% planned`, ...extra },
        source_id: n.source_id ?? 'ca2',
        locator: n.locator ?? 'Portfolio record',
        column: n.column,
      });
    }
    const s = lookup.sources.get(key);
    if (!s) throw dangling();
    return shape({
      id: n.id,
      type: n.type,
      label: n.label ?? s.title,
      layer: s.layer,
      attrs: extra,
      source_id: key,
      locator: s.locator,
      column: n.column,
    });
  });
}

/** The four graph seed collections exactly as the graph service reads them. */
export function buildGraphSeed(files: SeedFiles) {
  const nodes = deriveGraphNodes(files.graph.nodes, {
    countries: new Map(files.countries.map((c) => [c.id, c])),
    contracts: new Map(files.contracts.map((c) => [c.id, c])),
    sources: new Map(Object.entries(files.sources)),
  });
  return { nodes, edges: files.graph.edges, supplierRegistry: files.graph.supplierRegistry, suppliersRaw: files.graph.suppliersRaw };
}

/** Graph collection names (shared contract with services/graph). */
export const GRAPH_COLLECTIONS = {
  nodes: 'graphNodes',
  edges: 'graphEdges',
  supplierRegistry: 'supplierRegistry',
  suppliersRaw: 'suppliersRaw',
} as const;
