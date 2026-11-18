import { beforeAll, describe, expect, it } from 'vitest';
import { runSeed } from '../src/seed/seeder.js';
import { testApp, useTestDb } from './helpers.js';
import { readSeed, SEED_DIR } from './seed-dir.js';

useTestDb();
beforeAll(async () => {
  await runSeed({ seedDir: SEED_DIR });
});

const { api } = testApp();

describe('reference', () => {
  it('reference returns 8 countries and Civil Works methods', async () => {
    const res = await api.get('/v1/reference');
    expect(res.status).toBe(200);
    expect(res.body.countries).toHaveLength(8);
    expect(res.body.countries[0]).toMatchObject({ id: 'KE', name: 'Kenya' });
    expect(res.body.methods['Civil Works']).toContain('RFB, open international');
    expect(res.body.defaultPackage.name).toBe('Rural roads rehabilitation, Phase II');
    expect(Object.keys(res.body.layers)).toEqual(['ledger', 'procedure', 'retrospective']);
    expect(res.body.ratingScale).toEqual(['HU', 'U', 'MU', 'MS', 'S', 'HS']);
    expect(res.body).not.toHaveProperty('_id');
  });
});

describe('sources', () => {
  it('returns a passage by id', async () => {
    const res = await api.get('/v1/sources/ca1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'ca1', layer: 'ledger', kind: 'Major Contract Awards' });
  });

  it('lists every source with what a citation chip needs, in catalogue order', async () => {
    const res = await api.get('/v1/sources');
    const seed = readSeed<Record<string, { layer: string; kind: string; title: string }>>('sources.json');
    expect(res.body.items).toHaveLength(Object.keys(seed).length);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual(Object.keys(seed));
    expect(res.body.items[0]).toEqual({ id: 'ca1', layer: seed.ca1.layer, kind: seed.ca1.kind, title: seed.ca1.title });
  });

  it('unknown source is a 404 problem', async () => {
    const res = await api.get('/v1/sources/nope');
    expect(res.status).toBe(404);
    expect(res.body.type).toMatch(/not-found$/);
  });
});

describe('roads and content', () => {
  it('returns the road for a mapped contract', async () => {
    const res = await api.get('/v1/contracts/RRA-W-07/road');
    expect(res.status).toBe(200);
    expect(res.body.lengthKm).toBe(96);
    expect(res.body.ends).toEqual(['Kitui', 'Mwingi']);
    expect(res.body.cite).toEqual(['s2w07', 'isr2']);
    expect(res.body.segments[0].coords.length).toBeGreaterThan(2);
  });

  it('a contract without a road is a 404', async () => {
    expect((await api.get('/v1/contracts/RRA-G-04/road')).status).toBe(404);
  });

  it('serves view content and 404s other views', async () => {
    const res = await api.get('/v1/content/pipeline');
    expect(res.body.feeds).toHaveLength(8);
    expect((await api.get('/v1/content/package')).body.conflict[0].weight).toBeGreaterThan(0);
    expect((await api.get('/v1/content/ask')).status).toBe(404);
    expect((await api.get('/v1/content/nope')).status).toBe(404);
  });
});
