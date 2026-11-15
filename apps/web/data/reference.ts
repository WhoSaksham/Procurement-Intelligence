import type { Category, Contract, Country, Criteria, Package } from '@/lib/types';

// Reference data for the demo. Country covariates are illustrative values
// on the published CPIA / WGI scales, not official scores.

export const COUNTRIES: Country[] = [
  { id: 'KE', name: 'Kenya', region: 'Eastern & Southern Africa', cpia: 3.6, rq: 38, fcv: false, cpiaImputed: false },
  { id: 'ET', name: 'Ethiopia', region: 'Eastern & Southern Africa', cpia: 3.2, rq: 14, fcv: true, cpiaImputed: false },
  { id: 'SL', name: 'Sierra Leone', region: 'Western & Central Africa', cpia: 3.1, rq: 17, fcv: true, cpiaImputed: false },
  { id: 'BD', name: 'Bangladesh', region: 'South Asia', cpia: 3.3, rq: 19, fcv: false, cpiaImputed: false },
  { id: 'NP', name: 'Nepal', region: 'South Asia', cpia: 3.4, rq: 27, fcv: false, cpiaImputed: false },
  { id: 'VN', name: 'Vietnam', region: 'East Asia & Pacific', cpia: 3.9, rq: 41, fcv: false, cpiaImputed: true },
  { id: 'PE', name: 'Peru', region: 'Latin America & Caribbean', cpia: 4.0, rq: 63, fcv: false, cpiaImputed: true },
  { id: 'MA', name: 'Morocco', region: 'Middle East & North Africa', cpia: 3.8, rq: 44, fcv: false, cpiaImputed: true },
];

export const SECTORS = ['Transport', 'Water', 'Energy', 'Health', 'Education', 'Agriculture', 'Digital'];

export const CATEGORIES: Category[] = ['Civil Works', 'Goods', 'Consulting Services', 'Non-consulting Services'];

export const METHODS: Record<Category, string[]> = {
  'Civil Works': ['RFB, open international', 'RFB, open national', 'RFQ', 'Limited competition', 'Direct selection'],
  Goods: ['RFB, open international', 'RFB, open national', 'RFQ', 'Direct selection'],
  'Consulting Services': ['QCBS', 'QBS', 'CQS', 'Direct selection'],
  'Non-consulting Services': ['RFB, open international', 'RFB, open national', 'RFQ', 'Direct selection'],
};

export const DEFAULT_PACKAGE: Package = {
  name: 'Rural roads rehabilitation, Phase II',
  country: 'KE',
  sector: 'Transport',
  category: 'Civil Works',
  method: 'RFB, open international',
  value: 18.4,
  durationMonths: 24,
  review: 'Prior',
  agency: 'some',
  lots: 1,
  esRisk: 'Substantial',
  plannedDays: 120,
};

export const DEFAULT_CRITERIA: Criteria = {
  turnover: 30,
  similarContracts: 3,
  similarValuePct: 100,
  bidSecurityPct: 2,
  submissionDays: 30,
  validityDays: 120,
  jvAllowed: false,
  specText:
    'Supply and lay asphalt concrete wearing course, 50 mm thick, using a Caterpillar AP655 paver or approved. Bitumen shall be 60/70 penetration grade. Culverts shall be precast concrete, minimum 900 mm diameter, to be designed by the Contractor.',
};

// Active contracts under supervision for the execution monitor.
export const PORTFOLIO: Contract[] = [
  {
    id: 'RRA-W-07',
    title: 'Kitui–Mwingi road rehabilitation (96 km)',
    supplier: 'Meridian Roadworks Ltd',
    value: 12.6,
    signed: '2024-02-12',
    planned: 58,
    actual: 37,
    warning: 0.71,
    mapped: true,
    signals: [
      { text: 'Satellite shows no works on km 44–57, which ISR 9 reports as earthworks complete', level: 'high', cite: ['s2w07', 'isr2'] },
      { text: 'Interim payment certificates 3–5 cleared in 61–80 days against 28 contractual', level: 'high', cite: ['isr2', 'icr2'] },
      { text: 'Variation orders total 13.8% of contract value; 15% triggers a fresh prior review', level: 'high', cite: ['ca2', 'icr3'] },
      { text: 'Contractor\'s site engineer replaced twice in six months', level: 'medium', cite: ['isr2'] },
      { text: 'Performance security valid until 2025-12-31; completion forecast past expiry', level: 'medium', cite: ['ca2'] },
    ],
    milestones: [
      { name: 'Mobilisation', planned: ['2024-02', '2024-04'], actual: ['2024-02', '2024-05'] },
      { name: 'Earthworks and drainage', planned: ['2024-04', '2024-11'], actual: ['2024-05', '2025-04'] },
      { name: 'Sub-base and base', planned: ['2024-09', '2025-05'], actual: ['2025-02', null] },
      { name: 'Surfacing', planned: ['2025-03', '2025-10'], actual: [null, null] },
      { name: 'Taking over', planned: ['2025-11', '2026-01'], actual: [null, null] },
    ],
  },
  {
    id: 'RRA-W-08',
    title: 'Wote–Kathonzweni low-volume seal road (26 km)',
    supplier: 'Tana Civil Contractors',
    value: 6.9,
    signed: '2024-05-03',
    planned: 49,
    actual: 44,
    warning: 0.32,
    mapped: true,
    signals: [
      { text: 'Satellite change matches reported progress on all segments', level: 'low', cite: ['s2w08'] },
      { text: 'Progress 5 points behind plan, within the normal band for this stage', level: 'low', cite: ['ca1'] },
      { text: 'Rainy-season shutdown not reflected in the approved work programme', level: 'medium', cite: ['icr3'] },
    ],
    milestones: [
      { name: 'Mobilisation', planned: ['2024-05', '2024-06'], actual: ['2024-05', '2024-07'] },
      { name: 'Earthworks and drainage', planned: ['2024-06', '2024-12'], actual: ['2024-07', '2025-01'] },
      { name: 'Sub-base and base', planned: ['2024-11', '2025-05'], actual: ['2024-12', null] },
      { name: 'Surfacing', planned: ['2025-04', '2025-09'], actual: [null, null] },
      { name: 'Taking over', planned: ['2025-10', '2025-11'], actual: [null, null] },
    ],
  },
  {
    id: 'RRA-C-02',
    title: 'Construction supervision, Kitui–Mwingi and Wote roads',
    supplier: 'Kestrel Engineering Associates JV',
    value: 2.4,
    signed: '2023-11-20',
    planned: 62,
    actual: 55,
    warning: 0.44,
    signals: [
      { text: 'Supervision contract end date precedes works completion forecast for RRA-W-07 by 7 months', level: 'high', cite: ['icr2'] },
      { text: 'Key expert (resident engineer) substitution pending Bank no-objection for 34 days', level: 'medium', cite: ['step1'] },
    ],
    milestones: [
      { name: 'Design review', planned: ['2023-12', '2024-03'], actual: ['2023-12', '2024-04'] },
      { name: 'Supervision, Lot 7', planned: ['2024-02', '2026-01'], actual: ['2024-02', null] },
      { name: 'Supervision, Lot 8', planned: ['2024-05', '2025-11'], actual: ['2024-05', null] },
      { name: 'Final reports', planned: ['2025-12', '2026-03'], actual: [null, null] },
    ],
  },
  {
    id: 'RRA-G-04',
    title: 'Road condition survey equipment and software',
    supplier: 'Survey Dynamics GmbH',
    value: 0.9,
    signed: '2024-08-15',
    planned: 100,
    actual: 100,
    warning: 0.08,
    signals: [{ text: 'Delivered and accepted; warranty period running', level: 'low', cite: ['ca1'] }],
    milestones: [
      { name: 'Delivery', planned: ['2024-08', '2024-11'], actual: ['2024-08', '2024-11'] },
      { name: 'Installation and training', planned: ['2024-11', '2024-12'], actual: ['2024-11', '2025-01'] },
    ],
  },
];

// Supervision ratings history for P171204, used in the execution view.
export const RATING_SCALE = ['HU', 'U', 'MU', 'MS', 'S', 'HS'];
export const RATING_NAMES: Record<string, string> = {
  HS: 'Highly Satisfactory',
  S: 'Satisfactory',
  MS: 'Moderately Satisfactory',
  MU: 'Moderately Unsatisfactory',
  U: 'Unsatisfactory',
  HU: 'Highly Unsatisfactory',
};
export type RatingPoint = { label: string; date: string; rating: string; cite?: string; retrospective?: boolean };
export const ISR_HISTORY: RatingPoint[] = [
  { label: 'ISR 3', date: '2021-06', rating: 'MS' },
  { label: 'ISR 4', date: '2021-12', rating: 'MS' },
  { label: 'ISR 5', date: '2022-06', rating: 'S' },
  { label: 'ISR 6', date: '2022-12', rating: 'S' },
  { label: 'ISR 7', date: '2023-06', rating: 'S', cite: 'isr1' },
  { label: 'ISR 8', date: '2023-12', rating: 'MS' },
  { label: 'ISR 9', date: '2024-05', rating: 'MU', cite: 'isr2' },
  { label: 'ICR', date: '2025-02', rating: 'MU', cite: 'icr2', retrospective: true },
];
