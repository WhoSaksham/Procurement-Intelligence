// Types for the graph service, generated from its OpenAPI contract
// (services/graph/openapi.json → schema.d.ts via `npm run snapshot`).
import type { components } from './schema';

type S = components['schemas'];

export type GraphNode = S['Node'];
export type GraphEdge = S['Edge'];
export type GraphResponse = S['GraphResponse'];
export type NodeDetail = S['NodeDetail'];
export type ProvenanceRecord = S['ProvenanceRecord'];
export type SupplierCluster = S['SupplierCluster'];
export type Resolution = S['Resolution'];
export type Analytics = S['Analytics'];
export type Health = S['Health'];
export type Stats = S['Stats'];

/** Where the data in a response came from. */
export type Source = 'live' | 'snapshot';

/** The API's offline answer set when the graph service is unavailable (used by tests here). */
export interface Snapshot {
  generated_at: string;
  health: Health;
  full: GraphResponse;
  nodes: Record<string, NodeDetail>;
  clusters: SupplierCluster[];
  analytics: Analytics;
}

export type Envelope<T> = { source: Source; data: T } | { source: Source; error: string };
