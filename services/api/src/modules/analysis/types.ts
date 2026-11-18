// Domain types shared by the model, the store and the views.

export type LayerId = 'ledger' | 'procedure' | 'retrospective';

export type Category = 'Civil Works' | 'Goods' | 'Consulting Services' | 'Non-consulting Services';

export interface Country {
  id: string;
  name: string;
  region: string;
  /** CPIA public sector management score (1–6). */
  cpia: number;
  /** WGI regulatory quality percentile (0–100). */
  rq: number;
  fcv: boolean;
  cpiaImputed: boolean;
  custom?: boolean;
}

export interface Package {
  name: string;
  country: string;
  sector: string;
  category: Category;
  method: string;
  /** Estimated value, US$ millions. */
  value: number;
  durationMonths: number;
  review: 'Prior' | 'Post';
  agency: 'first' | 'some' | 'experienced';
  lots: number;
  esRisk: 'Low' | 'Moderate' | 'Substantial' | 'High';
  plannedDays: number;
}

export interface Criteria {
  turnover: number;
  similarContracts: number;
  similarValuePct: number;
  bidSecurityPct: number;
  submissionDays: number;
  validityDays: number;
  jvAllowed: boolean;
  specText: string;
}

export type SignalLevel = 'low' | 'medium' | 'high';

export interface Signal {
  text: string;
  level: SignalLevel;
  cite?: string[];
  own?: boolean;
}

export interface Milestone {
  name: string;
  planned: [string, string];
  actual: [string | null, string | null];
}

export interface Contract {
  id: string;
  title: string;
  supplier: string;
  value: number;
  signed: string;
  planned: number;
  actual: number;
  warning: number;
  mapped?: boolean;
  custom?: boolean;
  signals: Signal[];
  milestones: Milestone[];
}

export interface ContractDraft {
  title: string;
  supplier: string;
  value: number;
  signed?: string;
  paymentDays: number;
  planned: number;
  actual: number;
}

export interface Source {
  layer: LayerId;
  kind: string;
  title: string;
  project: string;
  date: string;
  locator: string;
  before?: string;
  quote: string;
  after?: string;
}

export interface Driver {
  label: string;
  /** Percentage-point change in risk if this factor were removed. */
  pp: number;
}

export interface Risk {
  p: number;
  drivers: Driver[];
}

export interface TimelineDriver {
  label: string;
  /** Percent change in expected duration from this factor. */
  pct: number;
}

export interface Prediction {
  scale: number;
  shape: number;
  p20: number;
  p50: number;
  p80: number;
  cdf: (t: number) => number;
  timelineDrivers: TimelineDriver[];
  rebid: Risk;
  amend: Risk;
  slip: Risk;
}

export interface MethodOption {
  method: string;
  p20: number;
  p50: number;
  p80: number;
  rebid: number;
  current: boolean;
  limit: string | null;
}

export type FindingStatus = 'ok' | 'watch' | 'flag';

export interface Finding {
  id: string;
  label: string;
  value: string;
  benchmark: string;
  status: FindingStatus;
  advice: string;
  cite: string[];
  weight: number;
}

export interface CriteriaCheck {
  findings: Finding[];
  stringency: number;
  annualCash: number;
}

export interface Comparables {
  n: number;
  widened: boolean;
  close?: number;
}

export interface Recommendation {
  title: string;
  body: string;
  cite: string[];
  stage: string;
}

export interface RoadSegment {
  from: number;
  to: number;
  status: 'sealed' | 'base' | 'earthworks' | 'not-started';
  change: number;
  note: string | null;
  coords: [number, number][];
}

export interface Road {
  /** Place names at chainage 0 and at the end. */
  ends?: [string, string];
  /** Sources for the satellite progress reading. */
  cite?: string[];
  lengthKm: number;
  segments: RoadSegment[];
}

// ── Types added with the API ──────────────────────────────────────────────

export type RatingPoint = { label: string; date: string; rating: string; cite?: string; retrospective?: boolean };

export interface Layer {
  name: string;
  question: string;
  note: string;
}

export interface Signoff {
  name: string;
  at: string;
  /** JSON of {pkg, criteria} at the moment of sign-off. */
  brief: string;
}

/** One step of an agent retrieval trace, as the trace panel shows it. */
export interface Step {
  name: string;
  tool: string;
  detail: string;
}

export interface Claim {
  text: string;
  cite: string[];
  /** Entailment support for the claim against its passage (0–1). */
  support: number;
}

export interface Answer {
  q: string;
  keys: string[];
  claims: Claim[];
}

export interface LearnEvent {
  when?: string;
  layer: LayerId;
  title: string;
  updates: [string, string][];
  fresh?: boolean;
}

export interface ReferenceData {
  sectors: string[];
  categories: Category[];
  methods: Record<Category, string[]>;
  defaultPackage: Package;
  defaultCriteria: Criteria;
  layers: Record<LayerId, Layer>;
  ratingScale: string[];
  ratingNames: Record<string, string>;
  isrHistory: RatingPoint[];
}
