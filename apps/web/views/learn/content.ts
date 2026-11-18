'use client';

import { useContent } from '@/lib/api/queries';

// Illustrative Learn-view content served by the API (/v1/content/learn).
export interface LearnContent {
  health: { name: string; value: string; limit: string; ok: boolean }[];
  phases: { name: string; months: string; current: boolean; items: string[] }[];
  kpis: { name: string; base: string; target: string; now: string; series: number[]; tgt: number; better: 'up' | 'down' }[];
}

export const useLearnContent = () => useContent<LearnContent>('learn');
