'use client';

import type { Analytics, Envelope, GraphResponse, Health, NodeDetail, Resolution, Source, SupplierCluster } from './types';

/** An error the graph API reported, with the HTTP status and where it came from. */
export class GraphError extends Error {
  constructor(public status: number, message: string, public source: Source) {
    super(message);
  }
}

export interface Result<T> {
  source: Source;
  data: T;
}

async function call<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  const res = await fetch(`/api/graph/${path}`, { cache: 'no-store', ...init });
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!body) throw new GraphError(res.status, 'The graph API returned no data', 'live');
  if ('error' in body) throw new GraphError(res.status, body.error, body.source);
  return body;
}

export const getGraph = (focus: string, hops: number) =>
  call<GraphResponse>(`graph?${new URLSearchParams({ focus, hops: String(hops) })}`);
export const getFullGraph = () => call<GraphResponse>('full');
export const getNode = (id: string) => call<NodeDetail>(`nodes/${encodeURIComponent(id)}`);
export const getClusters = () => call<SupplierCluster[]>('suppliers/clusters');
export const getAnalytics = () => call<Analytics>('analytics');
export const getHealth = () => call<Health>('health');
export const resolveSuppliers = (names: string[]) =>
  call<Resolution[]>('suppliers/resolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ names }),
  });
