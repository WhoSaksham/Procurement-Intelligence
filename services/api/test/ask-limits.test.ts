import { describe, expect, it } from 'vitest';
import { AskLimits } from '../src/modules/ask/limits.js';
import { useTestDb } from './helpers.js';

useTestDb();

const clock = (start = Date.UTC(2026, 10, 21, 12)) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};

describe('AskLimits', () => {
  it('allows rpm questions a minute, then refuses until the window moves', async () => {
    const c = clock();
    const l = new AskLimits({ rpm: 5, daily: 100, now: c.now, key: 'rpm' });
    for (let i = 0; i < 5; i++) expect(await l.take()).toBeNull();
    expect(await l.take()).toBe('limit');
    c.advance(61_000);
    expect(await l.take()).toBeNull();
  });

  it('a refused question does not count toward the minute', async () => {
    const c = clock();
    const l = new AskLimits({ rpm: 1, daily: 100, now: c.now, key: 'refused' });
    expect(await l.take()).toBeNull();
    c.advance(30_000);
    expect(await l.take()).toBe('limit');
    c.advance(31_000);
    expect(await l.take()).toBeNull();
  });

  it('concurrent questions cannot slip past the per-minute limit', async () => {
    const c = clock();
    const l = new AskLimits({ rpm: 2, daily: 100, now: c.now, key: 'race' });
    const r = await Promise.all(Array.from({ length: 6 }, () => l.take()));
    expect(r.filter((x) => x === null)).toHaveLength(2);
  });

  it('a question refused by the daily cap does not hold a minute slot', async () => {
    const c = clock(Date.UTC(2026, 10, 23, 1));
    const l = new AskLimits({ rpm: 2, daily: 1, now: c.now, key: 'release' });
    expect(await l.take()).toBeNull();
    expect(await l.take()).toBe('limit');
    c.advance(24 * 3600_000);
    expect(await l.take()).toBeNull();
    expect(await l.take()).toBe('limit');
  });

  it('caps questions per UTC day', async () => {
    const c = clock();
    const l = new AskLimits({ rpm: 100, daily: 3, now: c.now, key: 'daily' });
    for (let i = 0; i < 3; i++) expect(await l.take()).toBeNull();
    expect(await l.take()).toBe('limit');
    c.advance(24 * 3600_000);
    expect(await l.take()).toBeNull();
  });

  it('the daily count is shared through the database', async () => {
    const c = clock(Date.UTC(2026, 10, 22, 1));
    const a = new AskLimits({ rpm: 100, daily: 2, now: c.now, key: 'shared' });
    const b = new AskLimits({ rpm: 100, daily: 2, now: c.now, key: 'shared' });
    expect(await a.take()).toBeNull();
    expect(await b.take()).toBeNull();
    expect(await a.take()).toBe('limit');
  });

  it('cools down for 60 s after a quota error', async () => {
    const c = clock();
    const l = new AskLimits({ rpm: 100, daily: 100, now: c.now, key: 'cool' });
    l.tripCooldown();
    expect(await l.take()).toBe('cooldown');
    c.advance(59_000);
    expect(await l.take()).toBe('cooldown');
    c.advance(2_000);
    expect(await l.take()).toBeNull();
  });
});
