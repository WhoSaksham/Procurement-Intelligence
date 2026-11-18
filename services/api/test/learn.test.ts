import { beforeEach, describe, expect, it } from 'vitest';
import { runSeed } from '../src/seed/seeder.js';
import { testApp, useTestDb } from './helpers.js';
import { readSeed, SEED_DIR } from './seed-dir.js';

useTestDb();
beforeEach(async () => {
  await runSeed({ seedDir: SEED_DIR, force: true });
});
const { api } = testApp();
const seed = readSeed<{ initial: { title: string }[]; incoming: { title: string }[] }>('learn-events.json');

describe('learn events', () => {
  it('starts with the initial events, newest first, none fresh', async () => {
    const res = await api.get('/v1/learn/events');
    expect(res.body.events.map((e: { title: string }) => e.title)).toEqual(seed.initial.map((e) => e.title));
    expect(res.body.events.some((e: { fresh: boolean }) => e.fresh)).toBe(false);
    expect(res.body.remaining).toBe(seed.incoming.length);
  });

  it('learn next applies events in order and then 409s', async () => {
    for (let i = 0; i < seed.incoming.length; i++) {
      const res = await api.post('/v1/learn/events/next');
      expect(res.status).toBe(200);
      expect(res.body.events[0]).toMatchObject({ title: seed.incoming[i].title, fresh: true, when: '2025-11-01' });
      expect(res.body.events.filter((e: { fresh: boolean }) => e.fresh)).toHaveLength(1);
      expect(res.body.remaining).toBe(seed.incoming.length - i - 1);
    }
    const done = await api.post('/v1/learn/events/next');
    expect(done.status).toBe(409);
    expect(done.body.detail).toBe('No more sample events');
  });

  it('two concurrent next calls apply two different events', async () => {
    const [a, b] = await Promise.all([api.post('/v1/learn/events/next'), api.post('/v1/learn/events/next')]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const events = (await api.get('/v1/learn/events')).body.events.slice(0, 2).map((e: { title: string }) => e.title);
    expect(new Set(events)).toEqual(new Set(seed.incoming.slice(0, 2).map((e) => e.title)));
  });

  it('learn reset restores the queue', async () => {
    await api.post('/v1/learn/events/next');
    const res = await api.post('/v1/learn/events/reset');
    expect(res.body.remaining).toBe(seed.incoming.length);
    expect(res.body.events).toHaveLength(seed.initial.length);
  });
});
