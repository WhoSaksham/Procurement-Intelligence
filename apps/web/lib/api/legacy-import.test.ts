import { describe, expect, it, vi } from 'vitest';
import { importLegacyScenario, LEGACY_KEY } from '@/lib/api/legacy-import';

function storage(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

describe('legacy browser save import', () => {
  it('keeps the storage key used by the original app', () => {
    expect(LEGACY_KEY).toBe('procurement-scenario-v1');
  });

  it('imports and clears the key', async () => {
    const s = storage({ [LEGACY_KEY]: '{"pkg":{"value":9}}' });
    const importFn = vi.fn(async () => ({ id: 'new1', name: 'Mine' }));
    expect(await importLegacyScenario(s, importFn)).toEqual({ id: 'new1', name: 'Mine' });
    expect(importFn).toHaveBeenCalledWith('{"pkg":{"value":9}}');
    expect(s.getItem(LEGACY_KEY)).toBeNull();
  });

  it('leaves the key on failure', async () => {
    const s = storage({ [LEGACY_KEY]: '{"pkg":{}}' });
    expect(await importLegacyScenario(s, async () => { throw new Error('down'); })).toBeNull();
    expect(s.getItem(LEGACY_KEY)).not.toBeNull();
  });

  it('no key → null and no call', async () => {
    const importFn = vi.fn();
    expect(await importLegacyScenario(storage(), importFn)).toBeNull();
    expect(importFn).not.toHaveBeenCalled();
  });

  it('drops an unreadable save instead of retrying it forever', async () => {
    const s = storage({ [LEGACY_KEY]: 'not json' });
    const importFn = vi.fn();
    expect(await importLegacyScenario(s, importFn)).toBeNull();
    expect(importFn).not.toHaveBeenCalled();
    expect(s.getItem(LEGACY_KEY)).toBeNull();
  });

  it('works when storage throws', async () => {
    const s = storage();
    s.getItem = () => {
      throw new Error('denied');
    };
    expect(await importLegacyScenario(s, vi.fn())).toBeNull();
  });
});
