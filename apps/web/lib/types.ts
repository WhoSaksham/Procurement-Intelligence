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
  lengthKm: number;
  segments: RoadSegment[];
}
