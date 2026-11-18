'use client';

import { useContent } from '@/lib/api/queries';

// Illustrative Package-page content served by the API (/v1/content/package).

export interface PackageContent {
  risks: { key: 'rebid' | 'amend' | 'slip'; name: string; cite: string[] }[];
  precedents: { name: string; id: string; match: number; why: string; outcome: string; cite: string[] }[];
  pastSpecs: { title: string; sim: number; result: string; cite: string[] }[];
  conflict: { src: string; label: string; says: string; weight: number; share: number }[];
  resolution: { toward: string; share: number; contested: boolean };
  peers: { m: number; p25: number; p50: number; p75: number }[];
  actual: { m: number; v: number }[];
  winners: { label: string; note?: string; v: number; tone?: string }[];
}

export const usePackageContent = () => useContent<PackageContent>('package');
