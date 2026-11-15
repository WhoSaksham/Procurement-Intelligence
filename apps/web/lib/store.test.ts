import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CRITERIA } from '@/data/reference';
import { checkCriteria } from '@/lib/model';
import { DEFAULT_SCENARIO, STORAGE_KEY } from '@/lib/scenario';

// Minimal browser storage for the persist middleware.
const mem = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const { useScenario } = await import('@/lib/store');
const get = () => useScenario.getState();

beforeEach(() => {
  get().resetAll();
  mem.clear();
});

describe('scenario store', () => {
  it('starts from the default scenario', () => {
    expect(get().pkg).toEqual(DEFAULT_SCENARIO.pkg);
  });

  it('patches the package and persists the bare scenario JSON', () => {
    get().setPkg({ value: 9 });
    expect(get().pkg.value).toBe(9);
    const saved = JSON.parse(mem.get(STORAGE_KEY) ?? '{}');
    expect(saved.pkg.value).toBe(9);
    expect(saved).not.toHaveProperty('state');
    expect(saved).not.toHaveProperty('setPkg');
  });

  it('applies benchmark criteria so stringency reaches zero', () => {
    get().applyBenchmark();
    expect(checkCriteria(get().pkg, get().criteria).stringency).toBe(0);
    expect(get().criteria).not.toEqual(DEFAULT_CRITERIA);
  });

  it('upserts and resets countries, marking them custom', () => {
    get().upsertCountry({ id: 'AT', name: 'Atlantis', region: 'X', cpia: 2.5, rq: 10, fcv: true, cpiaImputed: false });
    get().upsertCountry({ id: 'AT', name: 'Atlantis', region: 'X', cpia: 3.0, rq: 10, fcv: true, cpiaImputed: false });
    expect(get().countries).toHaveLength(1);
    expect(get().countries[0]).toMatchObject({ cpia: 3, custom: true });
    get().resetCountry('AT');
    expect(get().countries).toEqual([]);
  });

  it('numbers new contracts after the highest existing one', () => {
    const draft = { title: 'A', supplier: 'S', value: 1, paymentDays: 20, planned: 10, actual: 10 };
    const a = get().addContract(draft);
    const b = get().addContract(draft);
    expect([a.id, b.id]).toEqual(['USR-01', 'USR-02']);
    get().removeContract('USR-01');
    expect(get().addContract(draft).id).toBe('USR-03');
  });

  it('signs off and imports a whole scenario', () => {
    get().signOff('  A. Analyst ');
    expect(get().signoff?.name).toBe('A. Analyst');
    get().importScenario({ ...DEFAULT_SCENARIO, pkg: { ...DEFAULT_SCENARIO.pkg, lots: 4 } });
    expect(get().pkg.lots).toBe(4);
    expect(get().signoff).toBeNull();
  });

  it('rehydrates from an old save written by the Vite app', async () => {
    mem.set(STORAGE_KEY, JSON.stringify({ pkg: { value: 7 }, countries: [] }));
    await useScenario.persist.rehydrate();
    expect(get().pkg.value).toBe(7);
    expect(get().pkg.country).toBe('KE');
  });
});
