import { CATEGORIES, DEFAULT_CRITERIA, DEFAULT_PACKAGE, METHODS } from '@/data/reference';
import type { Contract, ContractDraft, Country, Criteria, Milestone, Package, Signal } from '@/lib/types';

// The analyst's working scenario: the draft package, its tender criteria,
// their own countries and contracts, and the sign-off. Kept in browser
// storage under the same key and shape as the original app, so earlier saves
// and exported files still load.

export const STORAGE_KEY = 'procurement-scenario-v1';

export interface Signoff {
  name: string;
  at: string;
  /** JSON of {pkg, criteria} at the moment of sign-off. */
  brief: string;
}

export interface Scenario {
  pkg: Package;
  criteria: Criteria;
  countries: Country[];
  contracts: Contract[];
  signoff: Signoff | null;
}

export const DEFAULT_SCENARIO: Scenario = {
  pkg: DEFAULT_PACKAGE,
  criteria: DEFAULT_CRITERIA,
  countries: [],
  contracts: [],
  signoff: null,
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const isCountry = (v: unknown): v is Country =>
  isObject(v) && typeof v.id === 'string' && typeof v.name === 'string' && Number.isFinite(v.cpia) && Number.isFinite(v.rq);

const isSignal = (v: unknown): v is Signal =>
  isObject(v) && typeof v.text === 'string' && ['low', 'medium', 'high'].includes(v.level as string);

const isMilestone = (v: unknown): v is Milestone =>
  isObject(v) && typeof v.name === 'string' && Array.isArray(v.planned) && v.planned.length === 2 && Array.isArray(v.actual) && v.actual.length === 2;

const isContract = (v: unknown): v is Contract =>
  isObject(v) && typeof v.id === 'string' && typeof v.title === 'string' && Number.isFinite(v.warning) && Array.isArray(v.signals);

const isSignoff = (v: unknown): v is Signoff =>
  isObject(v) && typeof v.name === 'string' && typeof v.at === 'string' && typeof v.brief === 'string';

const ALLOWED: Partial<Record<keyof Package, readonly string[]>> = {
  category: CATEGORIES,
  review: ['Prior', 'Post'],
  agency: ['first', 'some', 'experienced'],
  esRisk: ['Low', 'Moderate', 'Substantial', 'High'],
};
const POSITIVE: (keyof Package)[] = ['value', 'durationMonths', 'lots', 'plannedDays'];

/**
 * Copy only fields whose type matches the default (and, for numbers, are
 * finite and not negative), so a hand-edited or foreign file can never put a
 * value into the store that crashes a view.
 */
function mergeTyped<T extends object>(defaults: T, raw: Record<string, unknown>, ok: (key: keyof T, value: unknown) => boolean = () => true): T {
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const v = raw[key as string];
    const d = defaults[key];
    const sameType = typeof v === typeof d && (typeof v !== 'number' || (Number.isFinite(v) && v >= 0));
    if (sameType && ok(key, v)) out[key] = v as T[keyof T];
  }
  return out;
}

function hydratePackage(raw: unknown): Package {
  if (!isObject(raw)) return DEFAULT_PACKAGE;
  const pkg = mergeTyped(DEFAULT_PACKAGE, raw, (k, v) => {
    const allowed = ALLOWED[k];
    if (allowed) return allowed.includes(v as string);
    if (POSITIVE.includes(k)) return (v as number) > 0;
    return true;
  });
  // The method must be one the category allows.
  return METHODS[pkg.category].includes(pkg.method) ? pkg : { ...pkg, method: METHODS[pkg.category][0] };
}

const hydrateContract = (c: Contract): Contract => ({
  ...c,
  signals: c.signals.filter(isSignal),
  milestones: Array.isArray(c.milestones) ? c.milestones.filter(isMilestone) : [],
});

const hydrateCountry = (c: Country): Country => ({
  ...c,
  region: typeof c.region === 'string' ? c.region : 'Custom region',
  fcv: c.fcv === true,
  cpiaImputed: c.cpiaImputed === true,
});

/** Merge whatever was stored over the defaults, ignoring anything malformed. */
export function hydrate(raw: unknown): Scenario {
  if (!isObject(raw)) return DEFAULT_SCENARIO;
  return {
    pkg: hydratePackage(raw.pkg),
    criteria: isObject(raw.criteria) ? mergeTyped(DEFAULT_CRITERIA, raw.criteria) : DEFAULT_CRITERIA,
    countries: Array.isArray(raw.countries) ? raw.countries.filter(isCountry).map(hydrateCountry) : [],
    contracts: Array.isArray(raw.contracts) ? raw.contracts.filter(isContract).map(hydrateContract) : [],
    signoff: isSignoff(raw.signoff) ? raw.signoff : null,
  };
}

export type ImportResult = { ok: true; scenario: Scenario } | { ok: false; error: string };

/** Parse an exported scenario file. A file counts as a scenario only if it has a package or criteria. */
export function parseImport(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Not valid JSON' };
  }
  if (!isObject(data) || !(isObject(data.pkg) || isObject(data.criteria))) return { ok: false, error: 'Not a scenario file' };
  return { ok: true, scenario: hydrate(data) };
}

export const exportScenario = (s: Scenario): string => JSON.stringify({ version: 1, ...s }, null, 2);

/** File name for an exported scenario, from the package name. */
export const exportFileName = (s: Scenario) => `${s.pkg.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'scenario'}.json`;

/** Warning score and signals for a contract entered by the analyst. */
export function buildContract(d: ContractDraft, n: number): Contract {
  const gap = Math.max(0, d.planned - d.actual);
  const late = Math.max(0, d.paymentDays - 28);
  const warning = 1 / (1 + Math.exp(-(-2.2 + gap / 7 + late / 25)));
  const signals: Signal[] = [
    gap > 0
      ? { text: `Progress ${gap} points behind plan`, level: gap >= 15 ? 'high' : gap >= 5 ? 'medium' : 'low', own: true }
      : { text: 'Progress on or ahead of plan', level: 'low', own: true },
  ];
  if (late) {
    signals.push({
      text: `Payment certificates clearing in ${d.paymentDays} days against 28 contractual`,
      level: d.paymentDays > 56 ? 'high' : 'medium',
      own: true,
    });
  }
  return {
    id: `USR-${String(n).padStart(2, '0')}`,
    title: d.title.trim(),
    supplier: d.supplier.trim() || 'Supplier not given',
    value: d.value,
    signed: `${d.signed ?? '2024-07'}-01`,
    planned: d.planned,
    actual: d.actual,
    warning: Math.round(warning * 100) / 100,
    custom: true,
    signals,
    milestones: [],
  };
}

export const signoffBrief = (pkg: Package, criteria: Criteria) => JSON.stringify({ pkg, criteria });

/** True when the package or criteria changed after sign-off. */
export const isStale = (signoff: Signoff | null, pkg: Package, criteria: Criteria) =>
  !!signoff && signoff.brief !== signoffBrief(pkg, criteria);
