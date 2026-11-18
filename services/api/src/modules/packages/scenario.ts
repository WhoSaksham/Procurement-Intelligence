import type { Analysis, Scenario } from '../analysis/analyse.js';
import { Contract as ContractSchema, Country as CountrySchema, Criteria as CriteriaSchema, Package as PackageSchema } from '../analysis/schemas.js';
import type { Category, Contract, Country, Criteria, Milestone, Package, Signal, Signoff } from '../analysis/types.js';

// Scenario validation, import and export, moved from the web app's lib/scenario.ts.
// Old exports and old browser saves (the same JSON) still load: anything
// malformed is dropped or replaced by the default, never stored.

export type { Analysis, Scenario };

/** What hydration falls back to: the reference defaults and methods per category. */
export interface Defaults {
  defaultPackage: Package;
  defaultCriteria: Criteria;
  methods: Record<Category, string[]>;
  /** Built-in countries: an imported package pointing at an unknown country moves to the first one. */
  countries: Country[];
}

export const defaultScenario = (d: Defaults): Scenario => ({
  pkg: d.defaultPackage,
  criteria: d.defaultCriteria,
  countries: [],
  contracts: [],
  signoff: null,
});

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
  category: ['Civil Works', 'Goods', 'Consulting Services', 'Non-consulting Services'],
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

function hydratePackage(raw: unknown, d: Defaults, countries: Country[]): Package {
  if (!isObject(raw)) return d.defaultPackage;
  const pkg = mergeTyped(d.defaultPackage, raw, (k, v) => {
    const allowed = ALLOWED[k];
    if (allowed) return allowed.includes(v as string);
    if (POSITIVE.includes(k) && !((v as number) > 0)) return false;
    // The same per-field rules the API applies to every edit, so an import can't create a package that can't be edited.
    return PackageSchema.shape[k].safeParse(v).success;
  });
  // The method must be one the category allows, and the country one the package knows.
  const method = d.methods[pkg.category].includes(pkg.method) ? pkg.method : d.methods[pkg.category][0];
  const known = countries.some((c) => c.id === pkg.country) || d.countries.some((c) => c.id === pkg.country);
  return { ...pkg, method, country: known ? pkg.country : (d.countries[0]?.id ?? pkg.country) };
}

/** A contract with every field the views need, its malformed signals and milestones dropped; otherwise null. */
const hydrateContract = (c: Contract): Contract | null => {
  const r = ContractSchema.safeParse({
    ...c,
    signals: c.signals.filter(isSignal),
    milestones: Array.isArray(c.milestones) ? c.milestones.filter(isMilestone) : [],
  });
  return r.success ? r.data : null;
};

/** A country with in-range scores and only known fields; otherwise null. */
const hydrateCountry = (c: Country): Country | null => {
  const r = CountrySchema.safeParse({ ...c, region: typeof c.region === 'string' ? c.region : 'Custom region', fcv: c.fcv === true, cpiaImputed: c.cpiaImputed === true });
  return r.success ? { ...r.data, custom: true } : null;
};

const present = <T>(v: T | null): v is T => v !== null;

/** Merge whatever was stored over the defaults, ignoring anything malformed. */
export function hydrate(raw: unknown, d: Defaults): Scenario {
  if (!isObject(raw)) return defaultScenario(d);
  const countries = Array.isArray(raw.countries) ? raw.countries.filter(isCountry).map(hydrateCountry).filter(present) : [];
  return {
    pkg: hydratePackage(raw.pkg, d, countries),
    criteria: isObject(raw.criteria) ? mergeTyped(d.defaultCriteria, raw.criteria, (k, v) => CriteriaSchema.shape[k].safeParse(v).success) : d.defaultCriteria,
    countries,
    contracts: Array.isArray(raw.contracts) ? raw.contracts.filter(isContract).map(hydrateContract).filter(present) : [],
    signoff: isSignoff(raw.signoff) ? raw.signoff : null,
  };
}

export type ImportResult = { ok: true; scenario: Scenario } | { ok: false; error: string };

/** Parse an exported scenario file. A file counts as a scenario only if it has a package or criteria. */
export function parseImport(text: string, d: Defaults): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Not valid JSON' };
  }
  if (!isObject(data) || !(isObject(data.pkg) || isObject(data.criteria))) return { ok: false, error: 'Not a scenario file' };
  return { ok: true, scenario: hydrate(data, d) };
}

export const exportScenario = (s: Scenario): string => JSON.stringify({ version: 1, ...s }, null, 2);

/** File name for an exported scenario, from the package name. */
export const exportFileName = (s: Scenario) => `${s.pkg.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'scenario'}.json`;
