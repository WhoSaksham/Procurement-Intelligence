import { beforeEach, describe, expect, it } from 'vitest';
import { PackageModel } from '../src/modules/packages/model.js';
import { runSeed } from '../src/seed/seeder.js';
import { testApp, useTestDb } from './helpers.js';
import { DEFAULT_PACKAGE, PORTFOLIO } from './ref.js';
import { SEED_DIR } from './seed-dir.js';

useTestDb();
beforeEach(async () => {
  await PackageModel.deleteMany({});
  await runSeed({ seedDir: SEED_DIR, force: true });
});
const { api } = testApp();

const create = async (body: object = {}) => {
  const res = await api.post('/v1/packages').send(body);
  expect(res.status).toBe(201);
  return res.body as { id: string; version: number; pkg: typeof DEFAULT_PACKAGE; [k: string]: unknown };
};

describe('listing and creating', () => {
  it('lists the example first', async () => {
    const mine = await create({ name: 'Mine' });
    const res = await api.get('/v1/packages');
    expect(res.body.items[0]).toMatchObject({ id: 'example', example: true, name: DEFAULT_PACKAGE.name, country: 'KE', signedOff: false });
    expect(res.body.items[1]).toMatchObject({ id: mine.id, example: false, name: 'Mine' });
  });

  it('create without a source starts from the defaults', async () => {
    const p = await create();
    expect(p.id).toMatch(/^[a-z0-9]{10}$/);
    expect(p).toMatchObject({ example: false, version: 1, signoff: null, countries: [], contracts: [] });
    expect(p.pkg).toEqual(DEFAULT_PACKAGE);
    expect((p.analysis as { prediction: { p50: number } }).prediction.p50).toBeGreaterThan(0);
  });

  it('create copies a package and clears signoff', async () => {
    const a = await create({ name: 'A' });
    await api.post(`/v1/packages/${a.id}/signoff`).send({ version: 1, name: 'Ana' });
    const copy = await create({ fromId: a.id });
    expect(copy.pkg.name).toBe('A (copy)');
    expect(copy.signoff).toBeNull();
    const ex = await create({ fromId: 'example' });
    expect(ex.pkg.name).toBe(`${DEFAULT_PACKAGE.name} (copy)`);
    expect(ex.example).toBe(false);
  });

  it('create from an unknown package is a 404', async () => {
    expect((await api.post('/v1/packages').send({ fromId: 'nope' })).status).toBe(404);
  });
});

describe('editing', () => {
  it('patch saves, bumps version and returns analysis', async () => {
    const p = await create();
    const before = (p.analysis as { prediction: { onTime: number } }).prediction.onTime;
    const res = await api.patch(`/v1/packages/${p.id}`).send({ version: 1, pkg: { plannedDays: 200 } });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
    expect(res.body.pkg.plannedDays).toBe(200);
    expect(res.body.analysis.prediction.onTime).toBeGreaterThan(before);
    expect((await api.get(`/v1/packages/${p.id}`)).body.pkg.plannedDays).toBe(200);
  });

  it('patch updates criteria and stringency together', async () => {
    const p = await create();
    const res = await api.patch(`/v1/packages/${p.id}`).send({ version: 1, criteria: { turnover: 10 } });
    expect(res.body.criteria.turnover).toBe(10);
    expect(res.body.analysis.check.findings[0].status).not.toBe('flag');
  });

  it('patch with a stale version is a 409 with the current document', async () => {
    const p = await create();
    await api.patch(`/v1/packages/${p.id}`).send({ version: 1, pkg: { lots: 2 } });
    const res = await api.patch(`/v1/packages/${p.id}`).send({ version: 1, pkg: { lots: 3 } });
    expect(res.status).toBe(409);
    expect(res.body.type).toMatch(/version-conflict$/);
    expect(res.body.current).toMatchObject({ id: p.id, version: 2, pkg: { lots: 2 } });
  });

  it('concurrent patches with the same version: exactly one wins', async () => {
    const p = await create();
    const [a, b] = await Promise.all([
      api.patch(`/v1/packages/${p.id}`).send({ version: 1, pkg: { lots: 2 } }),
      api.patch(`/v1/packages/${p.id}`).send({ version: 1, pkg: { lots: 3 } }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await api.get(`/v1/packages/${p.id}`)).body.version).toBe(2);
  });

  it('patch rejects a method outside the category', async () => {
    const p = await create();
    const res = await api.patch(`/v1/packages/${p.id}`).send({ version: 1, pkg: { method: 'QCBS' } });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].path).toBe('pkg.method');
  });

  it('changing category with a valid method for it is accepted', async () => {
    const p = await create();
    const res = await api.patch(`/v1/packages/${p.id}`).send({ version: 1, pkg: { category: 'Consulting Services', method: 'QCBS' } });
    expect(res.status).toBe(200);
  });

  it('patch rejects negative value, unknown fields and unknown countries', async () => {
    const p = await create();
    expect((await api.patch(`/v1/packages/${p.id}`).send({ version: 1, pkg: { value: -3 } })).status).toBe(400);
    expect((await api.patch(`/v1/packages/${p.id}`).send({ version: 1, pkg: { bogus: 1 } })).status).toBe(400);
    const bad = await api.patch(`/v1/packages/${p.id}`).send({ version: 1, pkg: { country: 'ZZ' } });
    expect(bad.status).toBe(400);
    expect(bad.body.errors[0].path).toBe('pkg.country');
    expect((await api.patch(`/v1/packages/${p.id}`).send({ pkg: { lots: 2 } })).status).toBe(400);
  });

  it('signoff then patch makes analysis.stale true', async () => {
    const p = await create();
    const signed = await api.post(`/v1/packages/${p.id}/signoff`).send({ version: 1, name: '  Ana Analyst ' });
    expect(signed.body.signoff.name).toBe('Ana Analyst');
    expect(signed.body.analysis.stale).toBe(false);
    const edited = await api.patch(`/v1/packages/${p.id}`).send({ version: 2, pkg: { value: 9 } });
    expect(edited.body.analysis.stale).toBe(true);
  });

  it('benchmark moves criteria so stringency reaches zero', async () => {
    const p = await create();
    const res = await api.post(`/v1/packages/${p.id}/benchmark`).send({ version: 1 });
    expect(res.body.analysis.check.stringency).toBe(0);
  });

  it('reset restores example content and keeps id', async () => {
    const p = await create({ name: 'Mine' });
    await api.patch(`/v1/packages/${p.id}`).send({ version: 1, pkg: { lots: 4 } });
    const res = await api.post(`/v1/packages/${p.id}/reset`).send({ version: 2 });
    expect(res.body).toMatchObject({ id: p.id, version: 3, pkg: DEFAULT_PACKAGE, contracts: [], signoff: null });
  });
});

describe('countries and contracts', () => {
  const ATLANTIS = { id: 'AT', name: 'Atlantis', region: 'Eastern & Southern Africa', cpia: 2.5, rq: 10, fcv: true, cpiaImputed: false };

  it('upserts a custom country and uses it', async () => {
    const p = await create();
    const put = await api.put(`/v1/packages/${p.id}/countries/AT`).send({ version: 1, country: ATLANTIS });
    expect(put.body.countries).toEqual([{ ...ATLANTIS, custom: true }]);
    const res = await api.patch(`/v1/packages/${p.id}`).send({ version: 2, pkg: { country: 'AT' } });
    expect(res.body.analysis.country.name).toBe('Atlantis');
    const del = await api.delete(`/v1/packages/${p.id}/countries/AT?version=3`);
    expect(del.body.countries).toEqual([]);
    expect(del.body.pkg.country).toBe('KE');
  });

  it('rejects a country whose id does not match the path', async () => {
    const p = await create();
    expect((await api.put(`/v1/packages/${p.id}/countries/XX`).send({ version: 1, country: ATLANTIS })).status).toBe(400);
  });

  it('add contract computes warning and id USR-01, then USR-02', async () => {
    const p = await create();
    const draft = { title: 'Bridge', supplier: '', value: 3, paymentDays: 70, planned: 60, actual: 40 };
    const one = await api.post(`/v1/packages/${p.id}/contracts`).send({ version: 1, draft });
    expect(one.status).toBe(201);
    expect(one.body.contracts[0]).toMatchObject({ id: 'USR-01', custom: true, supplier: 'Supplier not given' });
    expect(one.body.contracts[0].warning).toBeGreaterThan(0.5);
    const two = await api.post(`/v1/packages/${p.id}/contracts`).send({ version: 2, draft });
    expect(two.body.contracts.map((c: { id: string }) => c.id)).toEqual(['USR-01', 'USR-02']);
    const del = await api.delete(`/v1/packages/${p.id}/contracts/USR-01?version=3`);
    expect(del.body.contracts.map((c: { id: string }) => c.id)).toEqual(['USR-02']);
    const three = await api.post(`/v1/packages/${p.id}/contracts`).send({ version: 4, draft });
    expect(three.body.contracts.map((c: { id: string }) => c.id)).toEqual(['USR-02', 'USR-03']);
  });

  it('concurrent adds never share an id', async () => {
    const p = await create();
    const draft = { title: 'Bridge', supplier: 'S', value: 3, paymentDays: 20, planned: 60, actual: 60 };
    const rs = await Promise.all([1, 2, 3].map(() => api.post(`/v1/packages/${p.id}/contracts`).send({ version: 1, draft })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    const final = (await api.get(`/v1/packages/${p.id}`)).body.contracts;
    expect(new Set(final.map((c: { id: string }) => c.id)).size).toBe(final.length);
  });

  it('removing an unknown contract is a 404', async () => {
    const p = await create();
    expect((await api.delete(`/v1/packages/${p.id}/contracts/USR-09?version=1`)).status).toBe(404);
  });

  it('portfolio merges own contracts sorted by warning', async () => {
    const p = await create();
    await api.post(`/v1/packages/${p.id}/contracts`).send({ version: 1, draft: { title: 'Bad', supplier: 'S', value: 3, paymentDays: 120, planned: 90, actual: 10 } });
    const res = await api.get(`/v1/packages/${p.id}/portfolio`);
    expect(res.body.items).toHaveLength(PORTFOLIO.length + 1);
    expect(res.body.items[0].id).toBe('USR-01');
    const w = res.body.items.map((c: { warning: number }) => c.warning);
    expect(w).toEqual([...w].sort((a, b) => b - a));
  });
});

describe('the example package is read-only', () => {
  it('patch on the example is 409 example-read-only and the example is unchanged', async () => {
    const calls = [
      api.patch('/v1/packages/example').send({ version: 1, pkg: { lots: 2 } }),
      api.post('/v1/packages/example/signoff').send({ version: 1, name: 'X' }),
      api.post('/v1/packages/example/benchmark').send({ version: 1 }),
      api.post('/v1/packages/example/reset').send({ version: 1 }),
      api.post('/v1/packages/example/contracts').send({ version: 1, draft: { title: 'T', supplier: 'S', value: 1, paymentDays: 1, planned: 1, actual: 1 } }),
      api.put('/v1/packages/example/countries/AT').send({ version: 1, country: { id: 'AT', name: 'A', region: 'R', cpia: 3, rq: 3, fcv: false, cpiaImputed: false } }),
      api.delete('/v1/packages/example'),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(409);
      expect(res.body.type).toMatch(/example-read-only$/);
    }
    const ex = (await api.get('/v1/packages/example')).body;
    expect(ex).toMatchObject({ version: 1, pkg: DEFAULT_PACKAGE, signoff: null, contracts: [], countries: [] });
  });
});

describe('deleting, export and import', () => {
  it('deletes a user package', async () => {
    const p = await create();
    expect((await api.delete(`/v1/packages/${p.id}`)).status).toBe(204);
    expect((await api.get(`/v1/packages/${p.id}`)).status).toBe(404);
  });

  it('unknown package is a 404 problem on every route', async () => {
    const rs = await Promise.all([
      api.get('/v1/packages/nope'),
      api.patch('/v1/packages/nope').send({ version: 1, pkg: { lots: 2 } }),
      api.delete('/v1/packages/nope'),
      api.get('/v1/packages/nope/export'),
      api.get('/v1/packages/nope/portfolio'),
      api.post('/v1/packages/nope/signoff').send({ version: 1, name: 'X' }),
    ]);
    for (const r of rs) {
      expect(r.status).toBe(404);
      expect(r.body.type).toMatch(/not-found$/);
    }
  });

  it('export then import round-trips pkg, criteria, countries, contracts', async () => {
    const p = await create({ name: 'Round trip' });
    await api.put(`/v1/packages/${p.id}/countries/AT`).send({ version: 1, country: { id: 'AT', name: 'Atlantis', region: 'R', cpia: 3, rq: 20, fcv: false, cpiaImputed: false } });
    await api.post(`/v1/packages/${p.id}/contracts`).send({ version: 2, draft: { title: 'T', supplier: 'S', value: 1, paymentDays: 40, planned: 50, actual: 30 } });
    const exp = await api.get(`/v1/packages/${p.id}/export`);
    expect(exp.headers['content-disposition']).toBe('attachment; filename="round-trip.json"');
    const file = exp.text;
    expect(JSON.parse(file).version).toBe(1);
    const imp = await api.post('/v1/packages/import').set('content-type', 'text/plain').send(file);
    expect(imp.status).toBe(201);
    expect(imp.body.id).not.toBe(p.id);
    const orig = (await api.get(`/v1/packages/${p.id}`)).body;
    for (const k of ['pkg', 'criteria', 'countries', 'contracts', 'signoff']) expect(imp.body[k]).toEqual(orig[k]);
  });

  it('import sanitises a malformed scenario', async () => {
    const res = await api
      .post('/v1/packages/import')
      .send({ pkg: { value: -3, method: 'QCBS', category: 'Civil Works', bogus: 1 }, contracts: [{ id: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body.pkg.value).toBe(18.4);
    expect(res.body.pkg.method).toBe('RFB, open international');
    expect(res.body.pkg).not.toHaveProperty('bogus');
    expect(res.body.contracts).toEqual([]);
    expect(res.body.example).toBe(false);
  });

  it('import repairs or drops values the rest of the API would reject', async () => {
    const res = await api.post('/v1/packages/import').send({
      pkg: { name: '', country: 'ZZ', durationMonths: 1e-300, lots: 999 },
      countries: [
        { id: 'AT', name: 'Atlantis', region: 'R', cpia: 99, rq: -5, fcv: false, cpiaImputed: false },
        { id: 'BT', name: 'Bt', region: 'R', cpia: 3, rq: 20, fcv: false, cpiaImputed: false, $where: 'x', 'a.b': 1 },
      ],
      contracts: [
        { id: 'USR-01', title: 'Partial', warning: 0.2, signals: [] },
        { id: 'X'.repeat(41), title: 'Long id', supplier: 'S', value: 1, signed: '2024-01-01', planned: 1, actual: 1, warning: 0.1, signals: [], milestones: [] },
        { id: 'USR-02', title: 'Whole', supplier: 'S', value: 1, signed: '2024-01-01', planned: 10, actual: 5, warning: 0.3, signals: [], milestones: [], extra: 'x' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.pkg).toMatchObject({ name: DEFAULT_PACKAGE.name, country: 'KE', durationMonths: DEFAULT_PACKAGE.durationMonths, lots: DEFAULT_PACKAGE.lots });
    expect(res.body.countries).toEqual([{ id: 'BT', name: 'Bt', region: 'R', cpia: 3, rq: 20, fcv: false, cpiaImputed: false, custom: true }]);
    expect(res.body.contracts.map((c: { id: string }) => c.id)).toEqual(['USR-02']);
    expect(res.body.contracts[0]).not.toHaveProperty('extra');
    // The imported package stays editable.
    expect((await api.patch(`/v1/packages/${res.body.id}`).send({ version: 1, pkg: { name: 'Renamed' } })).status).toBe(200);
  });

  it('patch rejects out-of-range package values', async () => {
    const p = await create();
    for (const pkg of [{ durationMonths: 1e-300 }, { lots: 999 }, { plannedDays: 1e9 }, { name: '' }]) {
      expect((await api.patch(`/v1/packages/${p.id}`).send({ version: 1, pkg })).status).toBe(400);
    }
  });

  it("import of non-JSON is 400 'Not valid JSON'", async () => {
    const res = await api.post('/v1/packages/import').set('content-type', 'text/plain').send('{oops');
    expect(res.status).toBe(400);
    expect(res.body.detail).toBe('Not valid JSON');
    const notScenario = await api.post('/v1/packages/import').send({ foo: 1 });
    expect(notScenario.body.detail).toBe('Not a scenario file');
  });

  it('import never creates an example', async () => {
    const res = await api.post('/v1/packages/import').send({ pkg: {}, example: true, _id: 'example' });
    expect(res.body.example).toBe(false);
    expect(res.body.id).not.toBe('example');
  });
});
