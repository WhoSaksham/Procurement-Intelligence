import { COUNTRIES, METHODS } from '@/data/reference';
import type {
  Comparables,
  Country,
  Criteria,
  CriteriaCheck,
  Finding,
  MethodOption,
  Package,
  Prediction,
  Risk,
  TimelineDriver,
} from '@/lib/types';

// Linearised surrogate of the fitted models so the demo runs in the browser.
// Timeline: Weibull accelerated-failure-time model on days from advertisement
// (or REOI) to contract signature. Risks: logistic models on the same features.
//
// Every function takes the user's custom countries explicitly, so the model
// stays pure: same inputs, same outputs, no module state.

const SHAPE = 2.3;

const BASE_DAYS: Record<Package['category'], number> = {
  'Civil Works': 132,
  Goods: 100,
  'Consulting Services': 160,
  'Non-consulting Services': 94,
};

const METHOD_EFFECT: Record<string, number> = {
  'RFB, open international': 0.16,
  'RFB, open national': 0,
  RFQ: -0.48,
  'Limited competition': -0.2,
  'Direct selection': -0.9,
  QCBS: 0.08,
  QBS: 0.04,
  CQS: -0.32,
};

/** A country by id: user overrides and custom countries first, then built-ins. */
export const country = (id: string, custom: Country[] = []): Country =>
  custom.find((c) => c.id === id) ?? COUNTRIES.find((c) => c.id === id) ?? COUNTRIES[0];

/** Built-in countries with any user overrides applied, then custom countries. */
export const allCountries = (custom: Country[] = []): Country[] => [
  ...COUNTRIES.map((c) => custom.find((o) => o.id === c.id) ?? c),
  ...custom.filter((c) => !COUNTRIES.some((b) => b.id === c.id)),
];

/** [label, timelineLogEffect, rebidLogit, amendLogit, slipLogit] */
type Feature = [string, number, number, number, number];

function features(pkg: Package, custom: Country[], stringency = 0): Feature[] {
  const c = country(pkg.country, custom);
  const works = pkg.category === 'Civil Works';
  const consulting = pkg.category === 'Consulting Services';
  const direct = pkg.method === 'Direct selection';
  const f: Feature[] = [];

  f.push([`Method: ${pkg.method}`, METHOD_EFFECT[pkg.method] ?? 0,
    direct ? -1.6 : pkg.method === 'RFQ' ? -0.5 : pkg.method === 'RFB, open international' ? 0.22 : 0, 0, 0]);
  f.push([`Value: US$${pkg.value}M`, 0.09 * Math.log(pkg.value / 5), 0.08 * Math.log(pkg.value / 5),
    0.18 * Math.log(pkg.value / 5), 0.12 * Math.log(pkg.value / 5)]);
  f.push([`${c.name} public sector management (CPIA ${c.cpia}${c.cpiaImputed ? ', imputed' : ''})`,
    -0.22 * (c.cpia - 3.4), -0.55 * (c.cpia - 3.4), -0.3 * (c.cpia - 3.4), -0.45 * (c.cpia - 3.4)]);
  if (c.fcv) f.push(['Fragile and conflict-affected setting', 0.18, 0.45, 0.3, 0.5]);
  if (pkg.review === 'Prior') f.push(['Bank prior review', 0.12, -0.1, 0, 0]);
  if (pkg.agency === 'first') f.push(['First Bank-financed operation for the agency', 0.16, 0.74, 0.2, 0.35]);
  if (pkg.agency === 'experienced') f.push(['Experienced implementing agency', -0.08, -0.35, -0.1, -0.2]);
  if (pkg.lots > 1) f.push([`Split into ${pkg.lots} lots`, 0.04 * (pkg.lots - 1), -0.12 * Math.min(pkg.lots - 1, 4), 0, -0.08]);
  if (pkg.esRisk === 'Substantial') f.push(['Substantial E&S risk classification', 0.06, 0.1, 0.18, 0.15]);
  if (pkg.esRisk === 'High') f.push(['High E&S risk classification', 0.14, 0.2, 0.32, 0.3]);
  if (works) f.push(['Civil works contract', 0, 0.35, 0.62, 0.55]);
  if (consulting) f.push(['Consulting assignment', 0, 0.1, 0.2, 0]);
  if (stringency > 0) f.push(['Qualification criteria above benchmark', 0.05 * stringency, 0.42 * stringency, 0, 0]);
  return f;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const BASE_LOGIT = { rebid: -2.0, amend: -1.35, slip: -1.2 } as const;

export function predict(pkg: Package, custom: Country[] = [], stringency = 0): Prediction {
  const fs = features(pkg, custom, stringency);
  const logScale = Math.log(BASE_DAYS[pkg.category]) + fs.reduce((s, f) => s + f[1], 0);
  const scale = Math.exp(logScale);
  const q = (p: number) => scale * Math.pow(-Math.log(1 - p), 1 / SHAPE);

  const risk = (key: keyof typeof BASE_LOGIT, idx: 2 | 3 | 4): Risk => {
    const total = BASE_LOGIT[key] + fs.reduce((s, f) => s + f[idx], 0);
    const p = sigmoid(total);
    const drivers = fs
      .map((f) => ({ label: f[0], pp: (p - sigmoid(total - f[idx])) * 100 }))
      .filter((d) => Math.abs(d.pp) >= 0.5)
      .sort((a, b) => Math.abs(b.pp) - Math.abs(a.pp));
    return { p, drivers };
  };

  const timelineDrivers: TimelineDriver[] = fs
    .map((f) => ({ label: f[0], pct: (Math.exp(f[1]) - 1) * 100 }))
    .filter((d) => Math.abs(d.pct) >= 1)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  return {
    scale,
    shape: SHAPE,
    p20: q(0.2),
    p50: q(0.5),
    p80: q(0.8),
    cdf: (t: number) => 1 - Math.exp(-Math.pow(t / scale, SHAPE)),
    timelineDrivers,
    rebid: risk('rebid', 2),
    amend: risk('amend', 3),
    slip: risk('slip', 4),
  };
}

// Typical procurement-plan thresholds (US$ M). Real values are set per
// country in the procurement plan; these are representative.
const THRESHOLDS: Record<Package['category'], { RFQ?: number; national?: number; CQS?: number }> = {
  'Civil Works': { RFQ: 1, national: 15 },
  Goods: { RFQ: 0.2, national: 3 },
  'Non-consulting Services': { RFQ: 0.2, national: 3 },
  'Consulting Services': { CQS: 0.3 },
};

/** Why a method is not allowed at this value, or null if it is. */
export function eligibility(pkg: Package, method: string): string | null {
  const t = THRESHOLDS[pkg.category];
  if (method === 'Direct selection' || method === 'Limited competition') return 'Needs justification';
  if (method === 'RFQ' && t.RFQ !== undefined && pkg.value > t.RFQ) return `Above RFQ limit (US$${t.RFQ}M)`;
  if (method === 'RFB, open national' && t.national !== undefined && pkg.value > t.national) return `Above national limit (US$${t.national}M)`;
  if (method === 'CQS' && t.CQS !== undefined && pkg.value > t.CQS) return `Above CQS limit (US$${t.CQS}M)`;
  return null;
}

/** Counterfactual: the same package under every method allowed for its category. */
export function compareMethods(pkg: Package, custom: Country[] = [], stringency = 0): MethodOption[] {
  return METHODS[pkg.category].map((method) => {
    const r = predict({ ...pkg, method }, custom, stringency);
    return { method, p20: r.p20, p50: r.p50, p80: r.p80, rebid: r.rebid.p, current: method === pkg.method, limit: eligibility(pkg, method) };
  });
}

/** Lowest P80 adjusted for re-tender risk among methods allowed at this value. */
export function bestMethod(pkg: Package, custom: Country[] = [], stringency = 0): string | null {
  const eligible = compareMethods(pkg, custom, stringency).filter((o) => !o.limit);
  if (!eligible.length) return null;
  return eligible.reduce((a, b) => (b.p80 * (1 + b.rebid) < a.p80 * (1 + a.rebid) ? b : a)).method;
}

/** Draft criteria moved to the benchmark values, leaving in-range items alone. */
export function benchmarkCriteria(pkg: Package, c: Criteria): Criteria {
  const annualCash = pkg.value / (pkg.durationMonths / 12);
  const maxTurnover = Math.round(annualCash * 2.5 * 10) / 10;
  return {
    ...c,
    turnover: c.turnover > maxTurnover ? Math.round(annualCash * 2 * 10) / 10 : c.turnover,
    similarContracts: Math.min(c.similarContracts, 2),
    similarValuePct: Math.min(c.similarValuePct, 80),
    bidSecurityPct: Math.min(c.bidSecurityPct, 2),
    submissionDays: Math.max(c.submissionDays, pkg.method === 'RFB, open international' ? 42 : 21),
    jvAllowed: true,
    specText: c.specText.replace(/or approved/gi, 'or at least equivalent'),
  };
}

/**
 * How many close comparables back the estimate. Below 20 the cohort is
 * widened to the whole region and category, and the app says so.
 */
export function comparables(pkg: Package, custom: Country[] = []): Comparables {
  const c = country(pkg.country, custom);
  const isNew = c.custom && !COUNTRIES.some((b) => b.id === c.id);
  const close = Math.round(
    312 * Math.exp(-0.9 * Math.abs(Math.log(pkg.value / 15))) * (isNew ? 0.12 : 1) * (pkg.method === 'Direct selection' ? 0.3 : 1),
  );
  return close >= 20 ? { n: close, widened: false } : { n: close * 6 + 48, close, widened: true };
}

/**
 * Simple benchmark: median days for the method and category alone, with no
 * country, size or agency adjustment. The model must beat it to be shown.
 */
export function benchmarkDays(pkg: Package): number {
  return BASE_DAYS[pkg.category] * Math.exp(METHOD_EFFECT[pkg.method] ?? 0) * Math.pow(Math.log(2), 1 / SHAPE);
}

/** Deterministic sample of historical durations for the comparable cohort. */
export function cohortSample(pkg: Package, custom: Country[] = [], n = comparables(pkg, custom).n): number[] {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const r = predict(pkg, custom);
  return Array.from({ length: n }, () => r.scale * Math.pow(-Math.log(1 - rand()), 1 / SHAPE) * (0.9 + rand() * 0.2));
}

/**
 * Qualification criteria checks for tender design. Returns findings plus an
 * aggregate stringency score that feeds the re-tender model.
 */
export function checkCriteria(pkg: Package, cr: Criteria): CriteriaCheck {
  const annualCash = pkg.value / (pkg.durationMonths / 12);
  const ratio = cr.turnover / annualCash;
  const findings: Finding[] = [];

  findings.push({
    id: 'turnover',
    label: 'Average annual turnover',
    value: `US$${cr.turnover}M (${ratio.toFixed(1)}× annual cash flow of US$${annualCash.toFixed(1)}M)`,
    benchmark: '1.5–2.5× annual cash flow',
    status: ratio > 2.5 ? 'flag' : ratio < 1.5 ? 'watch' : 'ok',
    advice: ratio > 2.5
      ? `Lower to about US$${(annualCash * 2.5).toFixed(1)}M. A similar requirement at 4.2× led to seven of nine bids failing on one past package.`
      : ratio < 1.5 ? 'Below the usual range; check that it still screens out firms without financial capacity.' : 'Within the usual range.',
    cite: ratio > 2.5 ? ['sbd1', 'ber1', 'icr1'] : ['sbd1'],
    weight: Math.max(0, (ratio - 2.5) / 1.2),
  });

  const expBad = cr.similarContracts > 2 || cr.similarValuePct > 80;
  findings.push({
    id: 'experience',
    label: 'Specific construction experience',
    value: `${cr.similarContracts} contracts, each ≥ ${cr.similarValuePct}% of estimated value`,
    benchmark: 'At most 2 contracts at about 80% of value',
    status: expBad ? 'flag' : 'ok',
    advice: expBad ? 'Reduce to 2 similar contracts at 80% of estimated value. Overly specific experience was a re-tender cause in comparable rural roads packages.' : 'Within the usual range.',
    cite: expBad ? ['sbd2', 'icr1'] : ['sbd2'],
    weight: (cr.similarContracts > 2 ? 0.5 * (cr.similarContracts - 2) : 0) + (cr.similarValuePct > 80 ? (cr.similarValuePct - 80) / 40 : 0),
  });

  const minDays = pkg.method === 'RFB, open international' ? 42 : 21;
  findings.push({
    id: 'submission',
    label: 'Bid submission period',
    value: `${cr.submissionDays} calendar days`,
    benchmark: pkg.method === 'RFB, open international' ? '30 business days (about 42 calendar days)' : 'At least 21 calendar days',
    status: cr.submissionDays < minDays ? 'flag' : 'ok',
    advice: cr.submissionDays < minDays ? `Extend to at least ${minDays} calendar days. Short periods breach the regulations and reduce foreign participation.` : 'Meets the minimum.',
    cite: ['notice1'],
    weight: cr.submissionDays < minDays ? 0.6 : 0,
  });

  findings.push({
    id: 'security',
    label: 'Bid security',
    value: `${cr.bidSecurityPct}% of estimated value`,
    benchmark: '1–2% of estimated value, as a fixed amount',
    status: cr.bidSecurityPct > 2 ? 'flag' : 'ok',
    advice: cr.bidSecurityPct > 2 ? 'Reduce to 2% or less and state it as a fixed amount.' : 'Within the usual range.',
    cite: ['sbd1'],
    weight: cr.bidSecurityPct > 2 ? 0.3 : 0,
  });

  findings.push({
    id: 'jv',
    label: 'Joint ventures',
    value: cr.jvAllowed ? 'Allowed' : 'Not allowed',
    benchmark: 'Allowed, with aggregate qualification',
    status: cr.jvAllowed ? 'ok' : 'watch',
    advice: cr.jvAllowed ? 'Allows regional firms to combine capacity.' : 'Allowing joint ventures lets regional firms combine turnover and experience; this matters most when criteria are near the top of the range.',
    cite: ['ca3', 'icr1'],
    weight: cr.jvAllowed ? 0 : 0.2,
  });

  // Specification text scan: brand names without equivalence wording, and
  // design responsibilities shifted to the contractor without survey data.
  const brands = ['Caterpillar', 'Volvo', 'Komatsu', 'Siemens', 'Cisco', 'Dell', 'HP', 'Toyota'];
  const hits = brands.filter((b) => new RegExp(`\\b${b}\\b`, 'i').test(cr.specText));
  const equivalent = /or (at least )?equivalent/i.test(cr.specText);
  findings.push({
    id: 'brands',
    label: 'Brand names in specifications',
    value: hits.length ? hits.join(', ') + (equivalent ? ' (with "or equivalent")' : ' (no equivalence wording)') : 'None found',
    benchmark: 'Performance-based; brands only with "or at least equivalent"',
    status: hits.length && !equivalent ? 'flag' : 'ok',
    advice: hits.length && !equivalent ? 'Replace with performance requirements, or add "or at least equivalent". "Or approved" leaves acceptance to the engineer\'s discretion.' : 'No restrictive brand references.',
    cite: ['sbd3'],
    weight: hits.length && !equivalent ? 0.4 : 0,
  });

  if (/designed by the contractor/i.test(cr.specText)) {
    findings.push({
      id: 'design',
      label: 'Drainage design left to the contractor',
      value: 'Culvert design assigned to the contractor without survey data',
      benchmark: 'Hydrological survey before bidding',
      status: 'watch',
      advice: 'Commission a drainage survey before bidding. Missing drainage surveys led to variation orders of about 17% on a comparable project.',
      cite: ['icr3', 'ca2'],
      weight: 0,
    });
  }

  const stringency = findings.reduce((s, f) => s + f.weight, 0);
  return { findings, stringency, annualCash };
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;
export const days = (d: number) => `${Math.round(d)} days`;
export const riskLevel = (p: number) => (p >= 0.35 ? 'High' : p >= 0.2 ? 'Elevated' : 'Low');
