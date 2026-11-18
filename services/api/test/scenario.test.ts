import { describe, expect, it } from 'vitest';
import { defaultScenario, exportScenario, hydrate, parseImport, type Scenario } from '../src/modules/packages/scenario.js';
import { DEFAULT_CRITERIA, DEFAULT_PACKAGE, REF } from './ref.js';

// Moved from apps/web/lib/scenario.test.ts; hydrate and parseImport now take the defaults explicitly.
const D = { defaultPackage: DEFAULT_PACKAGE, defaultCriteria: DEFAULT_CRITERIA, methods: REF.methods, countries: REF.countries };

describe('hydrate', () => {
  it('fills defaults from a partial old save', () => {
    const s = hydrate({ pkg: { value: 9 } }, D);
    expect(s.pkg.value).toBe(9);
    expect(s.pkg.country).toBe('KE');
    expect(s.criteria).toEqual(DEFAULT_CRITERIA);
    expect(s.contracts).toEqual([]);
    expect(s.countries).toEqual([]);
    expect(s.signoff).toBeNull();
  });

  it('tolerates garbage', () => {
    for (const raw of ['x', null, undefined, 5, { pkg: 5 }, { countries: 'no', contracts: {} }]) {
      expect(hydrate(raw, D)).toEqual(defaultScenario(D));
    }
  });

  it('drops malformed list entries but keeps valid ones', () => {
    const s = hydrate({ countries: [{ id: 'AT', name: 'Atlantis', region: 'X', cpia: 3, rq: 20, fcv: false, cpiaImputed: false }, 7, null] }, D);
    expect(s.countries.map((c) => c.id)).toEqual(['AT']);
  });
});

describe('hydrate rejects wrongly typed fields', () => {
  it('keeps defaults for bad enums and wrong types so nothing downstream crashes', () => {
    const s = hydrate({
      pkg: { category: 'Works', method: 'Auction', name: 7, value: 'x', review: 'Maybe', agency: 'none', esRisk: 'Extreme', lots: -2, country: 'AT' },
      criteria: { specText: null, turnover: '30', jvAllowed: 'yes' },
    }, D);
    expect(s.pkg.category).toBe('Civil Works');
    expect(s.pkg.method).toBe('RFB, open international');
    expect(s.pkg.name).toBe(DEFAULT_PACKAGE.name);
    expect(s.pkg.value).toBe(DEFAULT_PACKAGE.value);
    expect(s.pkg.review).toBe('Prior');
    expect(s.pkg.agency).toBe(DEFAULT_PACKAGE.agency);
    expect(s.pkg.esRisk).toBe(DEFAULT_PACKAGE.esRisk);
    expect(s.pkg.lots).toBe(DEFAULT_PACKAGE.lots);
    // AT is not a country this scenario defines, so the package falls back to the first built-in.
    expect(s.pkg.country).toBe('KE');
    expect(s.criteria).toEqual(DEFAULT_CRITERIA);
  });

  it('keeps a country the scenario itself defines', () => {
    const at = { id: 'AT', name: 'Atlantis', region: 'X', cpia: 3, rq: 20, fcv: false, cpiaImputed: false };
    expect(hydrate({ pkg: { country: 'AT' }, countries: [at] }, D).pkg.country).toBe('AT');
  });

  it('resets a method that does not belong to a valid category', () => {
    expect(hydrate({ pkg: { category: 'Goods', method: 'QCBS' } }, D).pkg.method).toBe('RFB, open international');
    expect(hydrate({ pkg: { category: 'Consulting Services', method: 'QBS' } }, D).pkg.method).toBe('QBS');
  });

  it('fills missing contract milestones and drops malformed signals', () => {
    // A complete contract apart from milestones (contracts missing fields the views need are dropped; see packages.test.ts).
    const contract = { id: 'USR-01', title: 'T', supplier: 'S', value: 1, signed: '2024-07-01', planned: 50, actual: 40, warning: 0.2 };
    const s = hydrate({ contracts: [{ ...contract, signals: [{ text: 'ok', level: 'low' }, 5, { level: 'high' }] }] }, D);
    expect(s.contracts[0].milestones).toEqual([]);
    expect(s.contracts[0].signals).toEqual([{ text: 'ok', level: 'low' }]);
  });
});

describe('import and export', () => {
  it('rejects malformed JSON', () => {
    expect(parseImport('{oops', D)).toEqual({ ok: false, error: 'Not valid JSON' });
  });

  it('rejects JSON that is not a scenario', () => {
    expect(parseImport('{"foo":1}', D)).toEqual({ ok: false, error: 'Not a scenario file' });
    expect(parseImport('[1,2]', D)).toEqual({ ok: false, error: 'Not a scenario file' });
  });

  it('round-trips a scenario', () => {
    const s: Scenario = {
      ...defaultScenario(D),
      pkg: { ...DEFAULT_PACKAGE, value: 9, lots: 3 },
      signoff: { name: 'A. Analyst', at: '2026-11-15T10:00:00.000Z', brief: '{}' },
    };
    const back = parseImport(exportScenario(s), D);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.scenario).toEqual(s);
  });
});

