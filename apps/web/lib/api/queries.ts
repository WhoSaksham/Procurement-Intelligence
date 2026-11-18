'use client';

import { useQuery, type QueryClient, type QueryKey } from '@tanstack/react-query';
import * as client from './client';
import type { Content } from './types';

/** Query keys, in one place so mutations invalidate the right data. */
export const qk = {
  reference: ['reference'] as const,
  sourceIds: ['sources'] as const,
  source: (id: string) => ['source', id] as const,
  packages: ['packages'] as const,
  pkg: (id: string) => ['package', id] as const,
  portfolio: (id: string) => ['portfolio', id] as const,
  content: (view: string) => ['content', view] as const,
  learn: ['learn'] as const,
  questions: ['questions'] as const,
  road: (id: string) => ['road', id] as const,
};

/**
 * Refresh data after a write. A request already in flight may have started
 * before the write, and TanStack Query reuses an in-flight request for a query
 * that has no data yet instead of starting a new one, so cancel it first.
 */
export async function refresh(qc: QueryClient, queryKey: QueryKey): Promise<void> {
  await qc.cancelQueries({ queryKey });
  await qc.invalidateQueries({ queryKey });
}

// Seeded data only changes when the API is reseeded: fetch once per visit.
const STATIC = { staleTime: Infinity, gcTime: Infinity } as const;

export const useReference = () => useQuery({ queryKey: qk.reference, queryFn: client.getReference, ...STATIC });
export const useSourceIndex = () => useQuery({ queryKey: qk.sourceIds, queryFn: client.getSourceIndex, ...STATIC });
export const useSource = (id: string | null) =>
  useQuery({ queryKey: qk.source(id ?? ''), queryFn: () => client.getSource(id!), enabled: !!id, ...STATIC });
export const useContent = <T = Content>(view: 'package' | 'pipeline' | 'learn') =>
  useQuery({ queryKey: qk.content(view), queryFn: () => client.getContent<T>(view), ...STATIC });
export const useQuestions = () => useQuery({ queryKey: qk.questions, queryFn: client.getQuestions, ...STATIC });
export const useRoad = (contractId: string | null) =>
  useQuery({ queryKey: qk.road(contractId ?? ''), queryFn: () => client.getRoad(contractId!), enabled: !!contractId, retry: false, ...STATIC });
export const usePackages = () => useQuery({ queryKey: qk.packages, queryFn: client.listPackages });
export const usePortfolio = (id: string | null) =>
  useQuery({ queryKey: qk.portfolio(id ?? ''), queryFn: () => client.getPortfolio(id!), enabled: !!id, placeholderData: (prev) => prev });
export const useLearnEvents = () => useQuery({ queryKey: qk.learn, queryFn: client.getLearnEvents });
