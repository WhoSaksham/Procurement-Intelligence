'use client';

import { useContent } from '@/lib/api/queries';
import type { LayerId } from '@/lib/types';

// Illustrative Pipeline-view content served by the API (/v1/content/pipeline).
export interface PipelineContent {
  feeds: { name: string; layer: LayerId; format: string; cadence: string; records: string; n: number; api: string; lag: string }[];
  stages: { name: string; detail: string }[];
  linking: { label: string; v: number; tone?: string }[];
  run: { step: string; min: number; status: string; note?: string }[];
  icrTree: { name: string; pages: string; chunks: number; how: string }[];
  sampleChunk: string;
  quality: [string, string, string][];
}

export const usePipelineContent = () => useContent<PipelineContent>('pipeline');
