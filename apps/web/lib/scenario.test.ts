import { describe, expect, it } from 'vitest';
import { DEFAULT_CRITERIA, DEFAULT_PACKAGE } from '@/data/reference';
import {
  buildContract,
  DEFAULT_SCENARIO,
  exportScenario,
  hydrate,
  isStale,
  parseImport,
  signoffBrief,
  STORAGE_KEY,
  type Scenario,
} from '@/lib/scenario';

const round2 = (x: number) => Math.round(x * 100) / 100;
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

describe('hydrate', () => {
  it('keeps the storage key used by the original app', () => {
    expect(STORAGE_KEY).toBe('procurement-scenario-v1');
  });

  it('fills defaults from a partial old save', () => {
    const s = hydrate({ pkg: { value: 9 } });
    expect(s.pkg.value).toBe(9);
    expect(s.pkg.country).toBe('KE');
    expect(s.criteria).toEqual(DEFAULT_CRITERIA);
    expect(s.contracts).toEqual([]);
    expect(s.countries).toEqual([]);
    expect(s.signoff).toBeNull();
  });

  it('tolerates garbage', () => {
    for (const raw of ['x', null, undefined, 5, { pkg: 5 }, { countries: 'no', contracts: {} }]) {
      expect(hydrate(raw)).toEqual(DEFAULT_SCENARIO);
    }
  });

  it('drops malformed list entries but keeps valid ones', () => {
    const s = hydrate({ countries: [{ id: 'AT', name: 'Atlantis', region: 'X', cpia: 3, rq: 20, fcv: false, cpiaImputed: false }, 7, null] });
    expect(s.countries.map((c) => c.id)).toEqual(['AT']);
  });
});

describe('hydrate rejects wrongly typed fields', () => {
  it('keeps defaults for bad enums and wrong types so nothing downstream crashes', () => {
    const s = hydrate({
      pkg: { category: 'Works', method: 'Auction', name: 7, value: 'x', review: 'Maybe', agency: 'none', esRisk: 'Extreme', lots: -2, country: 'AT' },
      criteria: { specText: null, turnover: '30', jvAllowed: 'yes' },
    });
    expect(s.pkg.category).toBe('Civil Works');
    expect(s.pkg.method).toBe('RFB, open international');
    expect(s.pkg.name).toBe(DEFAULT_PACKAGE.name);
    expect(s.pkg.value).toBe(DEFAULT_PACKAGE.value);
    expect(s.pkg.review).toBe('Prior');
    expect(s.pkg.agency).toBe(DEFAULT_PACKAGE.agency);
    expect(s.pkg.esRisk).toBe(DEFAULT_PACKAGE.esRisk);
    expect(s.pkg.lots).toBe(DEFAULT_PACKAGE.lots);
    expect(s.pkg.country).toBe('AT');
    expect(s.criteria).toEqual(DEFAULT_CRITERIA);
  });

  it('resets a method that does not belong to a valid category', () => {
    expect(hydrate({ pkg: { category: 'Goods', method: 'QCBS' } }).pkg.method).toBe('RFB, open international');
    expect(hydrate({ pkg: { category: 'Consulting Services', method: 'QBS' } }).pkg.method).toBe('QBS');
  });

  it('fills missing contract milestones and drops malformed signals', () => {
    const s = hydrate({ contracts: [{ id: 'USR-01', title: 'T', warning: 0.2, signals: [{ text: 'ok', level: 'low' }, 5, { level: 'high' }] }] });
    expect(s.contracts[0].milestones).toEqual([]);
    expect(s.contracts[0].signals).toEqual([{ text: 'ok', level: 'low' }]);
  });
});

describe('import and export', () => {
  it('rejects malformed JSON', () => {
    expect(parseImport('{oops')).toEqual({ ok: false, error: 'Not valid JSON' });
  });

  it('rejects JSON that is not a scenario', () => {
    expect(parseImport('{"foo":1}')).toEqual({ ok: false, error: 'Not a scenario file' });
    expect(parseImport('[1,2]')).toEqual({ ok: false, error: 'Not a scenario file' });
  });

  it('round-trips a scenario', () => {
    const s: Scenario = {
      ...DEFAULT_SCENARIO,
      pkg: { ...DEFAULT_PACKAGE, value: 9, lots: 3 },
      signoff: { name: 'A. Analyst', at: '2026-11-15T10:00:00.000Z', brief: '{}' },
    };
    const back = parseImport(exportScenario(s));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.scenario).toEqual(s);
  });
});

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
    const s = DEFAULT_SCENARIO;
    const signoff = { name: 'A', at: 'now', brief: signoffBrief(s.pkg, s.criteria) };
    expect(isStale(signoff, s.pkg, s.criteria)).toBe(false);
    expect(isStale(signoff, { ...s.pkg, value: 10 }, s.criteria)).toBe(true);
    expect(isStale(null, s.pkg, s.criteria)).toBe(false);
  });
});
