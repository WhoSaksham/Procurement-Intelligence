import { describe, expect, it } from 'vitest';
import {
  allCountries,
  benchmarkCriteria,
  benchmarkDays,
  bestMethod,
  checkCriteria,
  cohortSample,
  comparables,
  compareMethods,
  eligibility,
  predict,
} from '../src/modules/analysis/model.js';
import type { Country, Package } from '../src/modules/analysis/types.js';
import { DEFAULT_CRITERIA, DEFAULT_PACKAGE, REF } from './ref.js';

// Expected values captured from the original JavaScript model (src/lib/model.js)
// before the port, so the TypeScript version must reproduce it exactly.
const P = DEFAULT_PACKAGE;
const ATLANTIS: Country = { id: 'AT', name: 'Atlantis', region: 'Eastern & Southern Africa', cpia: 2.5, rq: 10, fcv: true, cpiaImputed: false, custom: true };

describe('predict', () => {
  it('matches the JS model for the default package', () => {
    const r = predict(REF, P, [], 0);
    expect(r.p20).toBeCloseTo(103.9506481976721, 6);
    expect(r.p50).toBeCloseTo(170.15514296434228, 6);
    expect(r.p80).toBeCloseTo(245.4198923690416, 6);
    expect(r.rebid.p).toBeCloseTo(0.19220171201248373, 6);
    expect(r.amend.p).toBeCloseTo(0.4072185638808718, 6);
    expect(r.slip.p).toBeCloseTo(0.39325497084060446, 6);
  });

  it('applies criteria stringency to the timeline', () => {
    const s = checkCriteria(P, DEFAULT_CRITERIA).stringency;
    expect(predict(REF, P, [], s).p50).toBeCloseTo(196.05858646516364, 6);
  });

  it('cdf is 0.5 at the median', () => {
    const r = predict(REF, P, [], 0);
    expect(r.cdf(r.p50)).toBeCloseTo(0.5, 9);
  });

  it('custom country shifts the forecast', () => {
    const pkg: Package = { ...P, country: 'AT' };
    const r = predict(REF, pkg, [ATLANTIS], 0);
    expect(r.p50).toBeCloseTo(259.488043539324, 6);
    expect(r.p50).toBeGreaterThan(predict(REF, P, [ATLANTIS], 0).p50);
  });
});

describe('eligibility', () => {
  it('applies procurement thresholds', () => {
    expect(eligibility(P, 'RFQ')).toBe('Above RFQ limit (US$1M)');
    expect(eligibility(P, 'RFB, open national')).toBe('Above national limit (US$15M)');
    expect(eligibility({ ...P, category: 'Goods', value: 0.15 }, 'RFQ')).toBeNull();
    expect(eligibility({ ...P, category: 'Consulting Services', value: 0.4 }, 'CQS')).toBe('Above CQS limit (US$0.3M)');
    expect(eligibility(P, 'Direct selection')).toBe('Needs justification');
  });
});

describe('methods', () => {
  it('best method for the default package is open international', () => {
    const s = checkCriteria(P, DEFAULT_CRITERIA).stringency;
    expect(bestMethod(REF, P, [], s)).toBe('RFB, open international');
  });

  it('compares every method for the category', () => {
    const rows = compareMethods(REF, P, [], 0);
    expect(rows.map((r) => r.method)).toEqual(['RFB, open international', 'RFB, open national', 'RFQ', 'Limited competition', 'Direct selection']);
    expect(rows.find((r) => r.current)?.method).toBe(P.method);
  });
});

describe('criteria', () => {
  it('scores default criteria stringency like the JS model', () => {
    expect(checkCriteria(P, DEFAULT_CRITERIA).stringency).toBeCloseTo(2.8340579710144933, 9);
  });

  it('benchmark criteria clear all stringency', () => {
    expect(checkCriteria(P, benchmarkCriteria(P, DEFAULT_CRITERIA)).stringency).toBe(0);
  });
});

describe('cohort', () => {
  it('counts comparables and widens for custom countries only when small', () => {
    expect(comparables(REF, P, [])).toEqual({ n: 260, widened: false });
    expect(comparables(REF, { ...P, country: 'AT' }, [ATLANTIS])).toEqual({ n: 31, widened: false });
  });

  it('benchmark days ignore country', () => {
    expect(benchmarkDays(P)).toBeCloseTo(132.08537302374486, 6);
  });

  it('cohort sample is deterministic and sized by comparables', () => {
    const a = cohortSample(REF, P, []);
    expect(a).toHaveLength(260);
    expect(cohortSample(REF, P, [])).toEqual(a);
  });

  it('lists built-in countries with overrides and appends custom ones', () => {
    const list = allCountries(REF, [ATLANTIS, { ...ATLANTIS, id: 'KE', name: 'Kenya', cpia: 4.2 }]);
    expect(list.find((c) => c.id === 'KE')?.cpia).toBe(4.2);
    expect(list.at(-1)?.id).toBe('AT');
  });
});
