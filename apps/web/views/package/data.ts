import type { Step } from '@/components/AgentTrace';
import { country } from '@/lib/model';
import type { Country, Package } from '@/lib/types';

// Illustrative content for the Package page: precedents, past bidding
// documents, the ISR vs ICR evidence conflict, disbursement peers and winners.

export const RISKS: { key: 'rebid' | 'amend' | 'slip'; name: string; cite: string[] }[] = [
  { key: 'rebid', name: 'Re-tender', cite: ['ca1', 'ieg1'] },
  { key: 'amend', name: 'Amendment >10%', cite: ['ca2', 'icr3'] },
  { key: 'slip', name: 'Slippage >6 months', cite: ['icr2', 'fin1'] },
];

export const PRECEDENTS = [
  { name: 'Rural Access and Connectivity Project, Lot 2 works', id: 'P171204', match: 0.91, why: 'Same agency, sector and method; US$14.2M', outcome: 'Re-tendered once (+143 days); amended +19%', cite: ['ber1', 'ca2', 'icr1'] },
  { name: 'Feeder Roads and Market Access Project, Package W3', id: 'P165530', match: 0.84, why: 'Rural roads, open international RFB, US$11.0M', outcome: 'Signed in 171 days; variation orders 17%', cite: ['icr3'] },
  { name: 'Rural transport portfolio, 23 operations', id: 'IEG review', match: 0.78, why: 'Thematic evaluation covering this agency type', outcome: 'First-time agencies 2.1× more likely to re-tender', cite: ['ieg1'] },
];

export const PAST_SPECS = [
  { title: 'Rural roads Lot 2 (2020)', sim: 0.88, result: 'Re-tendered; turnover criterion excluded 7 of 9 bidders', cite: ['ber1'] },
  { title: 'Rural roads Lots 4–6 (2021)', sim: 0.86, result: 'Awarded first time; 17 bids; criteria sized per lot', cite: ['icr1', 'ca3'] },
  { title: 'Feeder roads W3 (2019)', sim: 0.79, result: 'Awarded; drainage variations of 17% later', cite: ['icr3'] },
];

// Evidence weighting for the ISR vs ICR disagreement on the parent project.
export interface EvidenceWeight { src: string; label: string; says: string; authority: number; independence: number; hindsight: number; corroboration: number }
export const CONFLICT: EvidenceWeight[] = [
  { src: 'isr1', label: 'ISR 7, June 2023', says: 'Satisfactory', authority: 0.6, independence: 0.4, hindsight: 0.5, corroboration: 0.3 },
  { src: 'icr2', label: 'ICR, February 2025', says: 'Moderately Unsatisfactory', authority: 0.8, independence: 0.6, hindsight: 1, corroboration: 0.9 },
  { src: 'ieg2', label: 'IEG review, September 2025', says: 'Moderately Unsatisfactory', authority: 1, independence: 1, hindsight: 1, corroboration: 0.9 },
  { src: 'fin1', label: 'Disbursement feed, 2024', says: '34% disbursed vs 55% planned', authority: 0.9, independence: 1, hindsight: 0.7, corroboration: 0.9 },
];
export const weight = (r: EvidenceWeight) => r.authority * r.independence * r.hindsight * r.corroboration;

// Parent project P171204 disbursement against similar rural transport projects.
const S = (m: number, c: number, k = 9) => Math.round(100 / (1 + Math.exp(-(m - c) / k)));
export const PEERS = Array.from({ length: 13 }, (_, i) => i * 6).map((m) => ({ m, p25: S(m, 33), p50: S(m, 27.5), p75: S(m, 22) }));
export const ACTUAL = Array.from({ length: 11 }, (_, i) => i * 3).map((m) => ({ m, v: S(m, 36) }));

// Winners of comparable awards (firm names illustrative).
export const WINNERS = [
  { label: 'Meridian Roadworks Ltd', note: 'domestic', v: 9 },
  { label: 'Tana Civil Contractors', note: 'domestic', v: 7 },
  { label: 'Highland Paving Co.', note: 'domestic', v: 6 },
  { label: 'Rift Valley Engineering', note: 'domestic', v: 5 },
  { label: 'Sahel Road Builders JV', note: 'foreign', v: 4, tone: 'alt' },
  { label: 'Coastal Infrastructure Group', note: 'foreign', v: 3, tone: 'alt' },
  { label: '31 other firms', v: 21, tone: 'quiet' },
];

export const LEVEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;
export const warnLevel = (w: number): 'high' | 'medium' | 'low' => (w >= 0.6 ? 'high' : w >= 0.3 ? 'medium' : 'low');

export function traceSteps(pkg: Package, custom: Country[]): Step[] {
  const c = country(pkg.country, custom);
  return [
    { name: 'Break the request into questions', tool: 'planner', detail: 'Schedule precedent, re-tender causes, contract-management lessons, country procurement rules.' },
    { name: 'Pull the comparable cohort', tool: 'SQL: contract awards', detail: `312 awards matched on ${pkg.category.toLowerCase()}, method, region (${c.region}) and sector.` },
    { name: 'Walk the knowledge graph', tool: 'graph', detail: 'Cohort contracts → 41 projects → 37 ICRs, 212 ISRs, 9 IEG reviews linked by Project ID and sector code.' },
    { name: 'Search the document index', tool: 'hybrid search', detail: 'Keyword + dense search over 18,402 chunks scoped to those documents; 46 candidate passages.' },
    { name: 'Rerank and deduplicate', tool: 'cross-encoder', detail: '12 passages kept; 4 near-duplicates collapsed to their most recent version.' },
    { name: 'Score the package', tool: 'timeline + risk models', detail: 'Survival model for days to signature; risk models for re-tender, amendment and slippage.' },
    { name: 'Check every claim against its source', tool: 'grounding check', detail: '17 claims drafted, 16 supported by a cited passage, 1 removed for lacking support.' },
  ];
}

