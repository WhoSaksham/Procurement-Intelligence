import { isStale } from './contract.js';
import {
  benchmarkDays,
  bestMethod,
  checkCriteria,
  cohortSample,
  comparables,
  compareMethods,
  country,
  predict,
  type Ref,
} from './model.js';
import { recommendations } from './recommend.js';
import { traceSteps } from './trace.js';
import type {
  Comparables,
  Contract,
  Country,
  Criteria,
  CriteriaCheck,
  MethodOption,
  Package,
  Prediction,
  Recommendation,
  Signoff,
  Step,
} from './types.js';

export type PredictionView = Omit<Prediction, 'cdf'>;

/** Everything the package views show, computed on the server and safe to serialise. */
export interface Analysis {
  country: Country;
  check: CriteriaCheck;
  /** Prediction at the current criteria; `onTime` is the chance of signing within the planned days. */
  prediction: PredictionView & { onTime: number };
  /** Prediction with criteria at benchmark (stringency 0). */
  atBenchmark: PredictionView;
  /** Share signed by day t: model curve and the comparable cohort's empirical curve. */
  curve: { t: number; model: number; history: number }[];
  methods: MethodOption[];
  best: string | null;
  comparables: Comparables;
  sample: number[];
  benchmarkDays: number;
  recommendations: Recommendation[];
  trace: Step[];
  stale: boolean;
}

export interface Scenario {
  pkg: Package;
  criteria: Criteria;
  countries: Country[];
  contracts: Contract[];
  signoff: Signoff | null;
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const view = ({ cdf: _cdf, ...p }: Prediction): PredictionView => p;

/** Points for the duration chart: same grid and rounding the web chart used before the move. */
function durationCurve(p: Prediction, sample: number[]) {
  const maxT = Math.max(360, Math.ceil((p.p80 * 1.6) / 60) * 60);
  const sorted = [...sample].sort((a, b) => a - b);
  const emp = (t: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo / sorted.length;
  };
  return Array.from({ length: 121 }, (_, i) => {
    const t = Math.round((i / 120) * maxT);
    return { t, model: round(p.cdf(t), 4), history: round(emp(t), 4) };
  });
}

export function analyse(ref: Ref, s: Scenario): Analysis {
  const { pkg, criteria, countries } = s;
  const check = checkCriteria(pkg, criteria);
  const result = predict(ref, pkg, countries, check.stringency);
  const sample = cohortSample(ref, pkg, countries);
  return {
    country: country(ref, pkg.country, countries),
    check,
    prediction: { ...view(result), onTime: result.cdf(pkg.plannedDays) },
    atBenchmark: view(predict(ref, pkg, countries, 0)),
    curve: durationCurve(result, sample),
    methods: compareMethods(ref, pkg, countries, check.stringency),
    best: bestMethod(ref, pkg, countries, check.stringency),
    comparables: comparables(ref, pkg, countries),
    sample,
    benchmarkDays: benchmarkDays(pkg),
    recommendations: recommendations(ref, pkg, result, countries),
    trace: traceSteps(ref, pkg, countries),
    stale: isStale(s.signoff, pkg, criteria),
  };
}
