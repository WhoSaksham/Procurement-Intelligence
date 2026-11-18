import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { ContractModel, RoadModel } from '../src/modules/contracts/model.js';
import { ContentModel } from '../src/modules/content/model.js';
import { AnswerModel } from '../src/modules/ask/model.js';
import { LearnEventModel } from '../src/modules/learn/model.js';
import { PackageModel } from '../src/modules/packages/model.js';
import { CountryModel, ReferenceModel } from '../src/modules/reference/model.js';
import { SourceModel } from '../src/modules/sources/model.js';
import { runSeed } from '../src/seed/seeder.js';
import { useTestDb } from './helpers.js';
import { editJson, readSeed, SEED_DIR, setVersion, tempSeedDir } from './seed-dir.js';

useTestDb();

const graphCount = (name: string) => mongoose.connection.collection(name).countDocuments();

describe('seeder', () => {
  it('seeds every collection', async () => {
    const r = await runSeed({ seedDir: SEED_DIR });
    expect(r).toEqual({ seeded: true, version: 1 });
    expect(await CountryModel.countDocuments()).toBe(readSeed<unknown[]>('countries.json').length);
    expect(await SourceModel.countDocuments()).toBe(Object.keys(readSeed<object>('sources.json')).length);
    expect(await ContractModel.countDocuments()).toBe(readSeed<unknown[]>('contracts.json').length);
    expect(await RoadModel.countDocuments()).toBe(Object.keys(readSeed<object>('roads.json')).length);
    expect(await ContentModel.countDocuments()).toBe(4);
    expect(await AnswerModel.countDocuments()).toBe(readSeed<{ answers: unknown[] }>('answers.json').answers.length);
    expect(await ReferenceModel.countDocuments()).toBe(1);
    const ev = readSeed<{ initial: unknown[]; incoming: unknown[] }>('learn-events.json');
    expect(await LearnEventModel.countDocuments()).toBe(ev.initial.length + ev.incoming.length);
    expect(await graphCount('graphNodes')).toBe(readSeed<unknown[]>('graph/nodes.json').length);
    expect(await graphCount('graphEdges')).toBe(readSeed<unknown[]>('graph/edges.json').length);
    expect(await graphCount('supplierRegistry')).toBe(readSeed<unknown[]>('graph/supplier_registry.json').length);
    expect(await graphCount('suppliersRaw')).toBe(readSeed<unknown[]>('graph/suppliers_raw.json').length);
  });

  it('stores conflict rows with their evidence weight', async () => {
    const pkg = await ContentModel.findById('package').lean();
    const rows = (pkg!.data as { conflict: { authority: number; independence: number; hindsight: number; corroboration: number; weight: number }[] }).conflict;
    for (const r of rows) expect(r.weight).toBeCloseTo(r.authority * r.independence * r.hindsight * r.corroboration, 10);
  });

  it('resolves the evidence conflict by share of weight', async () => {
    const pkg = await ContentModel.findById('package').lean();
    const data = pkg!.data as { conflict: { says: string; weight: number; share: number }[]; resolution: { toward: string; share: number; contested: boolean } };
    const total = data.conflict.reduce((s, r) => s + r.weight, 0);
    for (const r of data.conflict) expect(r.share).toBeCloseTo(r.weight / total, 10);
    const sat = data.conflict.filter((r) => r.says === 'Satisfactory').reduce((s, r) => s + r.share, 0);
    expect(data.resolution).toEqual({ toward: 'Moderately Unsatisfactory', share: 1 - sat, contested: false });
    expect(data.resolution.share).toBeGreaterThan(0.65);
  });

  it('creates the read-only example package from the defaults', async () => {
    const ex = await PackageModel.findById('example').lean();
    const ref = readSeed<{ defaultPackage: { name: string } }>('reference.json');
    expect(ex).toMatchObject({ example: true, version: 1, signoff: null, countries: [], contracts: [] });
    expect(ex!.pkg.name).toBe(ref.defaultPackage.name);
  });

  it('reseed keeps user packages', async () => {
    const user = await PackageModel.create({
      _id: 'user1', example: false, pkg: { name: 'Mine' }, criteria: {}, countries: [], contracts: [], signoff: null, version: 7, contractSeq: 0,
    });
    const before = await PackageModel.findById('user1').lean();
    await PackageModel.updateOne({ _id: 'example' }, { $set: { 'pkg.name': 'tampered' } });
    await LearnEventModel.updateMany({}, { $set: { appliedOrder: 999 } });

    expect(await runSeed({ seedDir: SEED_DIR })).toEqual({ seeded: false, version: 1 });
    expect((await PackageModel.findById('example').lean())!.pkg.name).toBe('tampered');

    const bumped = tempSeedDir((d) => setVersion(d, 2));
    expect(await runSeed({ seedDir: bumped })).toEqual({ seeded: true, version: 2 });
    expect(await PackageModel.findById('user1').lean()).toEqual(before);
    expect((await PackageModel.findById('example').lean())!.pkg.name).not.toBe('tampered');
    expect(await LearnEventModel.countDocuments({ pool: 'incoming', appliedOrder: null })).toBeGreaterThan(0);
    expect(user.id).toBe('user1');
  });

  it('example package is created when missing', async () => {
    await PackageModel.deleteOne({ _id: 'example' });
    const r = await runSeed({ seedDir: tempSeedDir((d) => setVersion(d, 2)) });
    expect(r.seeded).toBe(false);
    expect(await PackageModel.exists({ _id: 'example' })).toBeTruthy();
  });

  it('force reseeds at the same version', async () => {
    const dir = tempSeedDir((d) => {
      setVersion(d, 2);
      editJson<{ id: string; cpia: number }[]>(d, 'countries.json', (cs) => cs.forEach((c) => c.id === 'KE' && (c.cpia = 4.4)));
    });
    expect((await runSeed({ seedDir: dir, force: true })).seeded).toBe(true);
    const ke = await mongoose.connection.collection('graphNodes').findOne({ id: 'KE' });
    expect(ke!.attrs['CPIA public sector mgmt']).toBe('4.4');
  });
});
