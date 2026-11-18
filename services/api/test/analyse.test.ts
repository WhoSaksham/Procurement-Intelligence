import { describe, expect, it } from 'vitest';
import { analyse } from '../src/modules/analysis/analyse.js';
import { signoffBrief } from '../src/modules/analysis/contract.js';
import { checkCriteria, cohortSample, predict } from '../src/modules/analysis/model.js';
import { DEFAULT_CRITERIA, DEFAULT_PACKAGE, REF } from './ref.js';

const doc = { pkg: DEFAULT_PACKAGE, criteria: DEFAULT_CRITERIA, countries: [], contracts: [], signoff: null };

describe('analyse', () => {
  it('analysis matches the parts', () => {
    const a = analyse(REF, doc);
    const s = checkCriteria(DEFAULT_PACKAGE, DEFAULT_CRITERIA).stringency;
    const full = predict(REF, DEFAULT_PACKAGE, [], s);
    expect(a.check.stringency).toBeCloseTo(2.8340579710144933, 9);
    expect(a.prediction.p50).toBeCloseTo(full.p50, 9);
    expect(a.prediction.onTime).toBeCloseTo(full.cdf(DEFAULT_PACKAGE.plannedDays), 12);
    expect(a.atBenchmark.p50).toBeCloseTo(predict(REF, DEFAULT_PACKAGE, [], 0).p50, 9);
    expect(a.atBenchmark.p50).toBeCloseTo(170.15514296434228, 6);
    expect(a.best).toBe('RFB, open international');
    expect(a.methods).toHaveLength(5);
    expect(a.sample).toEqual(cohortSample(REF, DEFAULT_PACKAGE, []));
    expect(a.comparables).toEqual({ n: 260, widened: false });
    expect(a.benchmarkDays).toBeCloseTo(132.08537302374486, 6);
    expect(a.country.id).toBe('KE');
    expect(a.recommendations.length).toBeGreaterThan(0);
    expect(a.trace[1].detail).toContain(a.country.region);
  });

  it('curve uses the duration chart grid', () => {
    const a = analyse(REF, doc);
    expect(a.curve).toHaveLength(121);
    expect(a.curve[0]).toEqual({ t: 0, model: 0, history: 0 });
    const maxT = Math.max(360, Math.ceil((a.prediction.p80 * 1.6) / 60) * 60);
    expect(a.curve[120].t).toBe(maxT);
    expect(a.curve[60].t).toBe(Math.round(0.5 * maxT));
    const full = predict(REF, DEFAULT_PACKAGE, [], a.check.stringency);
    expect(a.curve[60].model).toBe(Math.round(full.cdf(a.curve[60].t) * 1e4) / 1e4);
    const sorted = [...a.sample].sort((x, y) => x - y);
    const emp = sorted.filter((v) => v <= a.curve[60].t).length / sorted.length;
    expect(a.curve[60].history).toBe(Math.round(emp * 1e4) / 1e4);
  });

  it('stale is false right after sign-off and true after a change', () => {
    const signoff = { name: 'A', at: 'now', brief: signoffBrief(DEFAULT_PACKAGE, DEFAULT_CRITERIA) };
    expect(analyse(REF, { ...doc, signoff }).stale).toBe(false);
    expect(analyse(REF, { ...doc, signoff, pkg: { ...DEFAULT_PACKAGE, value: 9 } }).stale).toBe(true);
    expect(analyse(REF, doc).stale).toBe(false);
  });

  it('analysis is JSON-serialisable', () => {
    const a = analyse(REF, doc);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect('cdf' in a.prediction).toBe(false);
  });

  it('uses the package custom country', () => {
    const at = { id: 'AT', name: 'Atlantis', region: 'Eastern & Southern Africa', cpia: 2.5, rq: 10, fcv: true, cpiaImputed: false, custom: true };
    const a = analyse(REF, { ...doc, pkg: { ...DEFAULT_PACKAGE, country: 'AT' }, countries: [at] });
    expect(a.country.name).toBe('Atlantis');
    expect(a.atBenchmark.p50).toBeCloseTo(259.488043539324, 6);
  });
});
