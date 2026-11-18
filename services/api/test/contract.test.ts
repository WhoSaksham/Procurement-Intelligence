import { describe, expect, it } from 'vitest';
import { buildContract, isStale, signoffBrief } from '../src/modules/analysis/contract.js';
import { DEFAULT_CRITERIA, DEFAULT_PACKAGE } from './ref.js';

// Moved unchanged from apps/web/lib/scenario.test.ts.
const round2 = (x: number) => Math.round(x * 100) / 100;
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

describe('buildContract', () => {
  it('scores warning from progress gap and late payment', () => {
    const c = buildContract({ title: ' Bridge ', supplier: '', value: 3, signed: '2024-09', paymentDays: 70, planned: 60, actual: 40 }, 3);
    expect(c.id).toBe('USR-03');
    expect(c.title).toBe('Bridge');
    expect(c.supplier).toBe('Supplier not given');
    expect(c.signed).toBe('2024-09-01');
    expect(c.warning).toBe(round2(sigmoid(-2.2 + 20 / 7 + 42 / 25)));
    expect(c.custom).toBe(true);
    expect(c.signals[0]).toMatchObject({ level: 'high', own: true });
    expect(c.signals[1]).toMatchObject({ level: 'high', text: expect.stringContaining('70 days') });
  });

  it('reports on-plan progress and no payment signal when on time', () => {
    const c = buildContract({ title: 'Survey', supplier: 'S', value: 1, paymentDays: 20, planned: 30, actual: 35 }, 1);
    expect(c.signals).toHaveLength(1);
    expect(c.signals[0]).toMatchObject({ text: 'Progress on or ahead of plan', level: 'low' });
  });
});

describe('sign-off', () => {
  it('is fresh right after signing and stale after any edit', () => {
    const s = { pkg: DEFAULT_PACKAGE, criteria: DEFAULT_CRITERIA };
    const signoff = { name: 'A', at: 'now', brief: signoffBrief(s.pkg, s.criteria) };
    expect(isStale(signoff, s.pkg, s.criteria)).toBe(false);
    expect(isStale(signoff, { ...s.pkg, value: 10 }, s.criteria)).toBe(true);
    expect(isStale(null, s.pkg, s.criteria)).toBe(false);
  });
});
