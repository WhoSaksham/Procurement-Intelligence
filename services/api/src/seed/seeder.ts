import mongoose from 'mongoose';
import { AnswerModel } from '../modules/ask/model.js';
import { ContentModel } from '../modules/content/model.js';
import { ContractModel, RoadModel } from '../modules/contracts/model.js';
import { LearnEventModel } from '../modules/learn/model.js';
import { EXAMPLE_ID, PackageModel, type PackageDoc } from '../modules/packages/model.js';
import { CountryModel, ReferenceModel } from '../modules/reference/model.js';
import { SourceModel } from '../modules/sources/model.js';
import { buildGraphSeed, GRAPH_COLLECTIONS } from './derive-graph.js';
import { loadSeedFiles, type SeedFiles } from './files.js';
import { SeedStateModel } from './model.js';

type Weighted = { says: string; authority: number; independence: number; hindsight: number; corroboration: number };

/** A side must carry this share of evidence weight, or the question is reported as contested. */
const RESOLVE_AT = 0.65;

/**
 * Weigh conflicting evidence: weight = authority × independence × hindsight ×
 * corroboration. The first row is the rating recorded at the time; the
 * conflict resolves toward the other rating if the rest of the evidence
 * carries enough weight. Ratings are never averaged.
 */
export function weighConflict(rows: Weighted[], ratingNames: string[]) {
  const weighted = rows.map((r) => ({ ...r, weight: r.authority * r.independence * r.hindsight * r.corroboration }));
  const total = weighted.reduce((s, r) => s + r.weight, 0) || 1;
  const conflict = weighted.map((r) => ({ ...r, share: r.weight / total }));
  const recorded = conflict[0]?.says;
  const toward = conflict.find((r) => r.says !== recorded && ratingNames.includes(r.says))?.says ?? recorded ?? '';
  const share = 1 - conflict.filter((r) => r.says === recorded).reduce((s, r) => s + r.share, 0);
  return { conflict, resolution: { toward, share, contested: share < RESOLVE_AT } };
}

const examplePackage = (files: SeedFiles): Omit<PackageDoc, 'createdAt' | 'updatedAt'> => ({
  _id: EXAMPLE_ID,
  example: true,
  pkg: files.reference.defaultPackage,
  criteria: files.reference.defaultCriteria,
  countries: [],
  contracts: [],
  signoff: null,
  version: 1,
  contractSeq: 0,
});

async function replace<T>(m: mongoose.Model<T>, docs: object[]) {
  await m.deleteMany({});
  if (docs.length) await m.insertMany(docs);
}

async function replaceRaw(name: string, docs: object[]) {
  const c = mongoose.connection.collection(name);
  await c.deleteMany({});
  // Copies: insertMany adds _id to the objects it is given.
  if (docs.length) await c.insertMany(docs.map((d) => ({ ...d })));
}

async function seedAll(files: SeedFiles) {
  await replace(ReferenceModel, [{ _id: 'reference', ...files.reference }]);
  await replace(CountryModel, files.countries.map(({ id, ...c }) => ({ _id: id, ...c })));
  await replace(SourceModel, Object.entries(files.sources).map(([id, s], seq) => ({ _id: id, seq, ...s })));
  await replace(ContractModel, files.contracts.map(({ id, ...c }) => ({ _id: id, ...c })));
  await replace(RoadModel, Object.entries(files.roads).map(([id, r]) => ({ _id: id, ...r })));

  const pkgContent = { ...files.content.package } as { conflict?: Weighted[] };
  Object.assign(pkgContent, weighConflict(pkgContent.conflict ?? [], Object.values(files.reference.ratingNames)));
  await replace(ContentModel, [
    { _id: 'package', data: pkgContent },
    { _id: 'pipeline', data: files.content.pipeline },
    { _id: 'learn', data: files.content.learn },
    // Ask settings, not a view: /v1/content/ask is not served.
    { _id: 'ask', data: { supportMin: files.answers.supportMin } },
  ]);
  await replace(AnswerModel, files.answers.answers.map((a, seq) => ({ seq, ...a })));

  const n = files.learnEvents.initial.length;
  await replace(LearnEventModel, [
    ...files.learnEvents.initial.map((e, seq) => ({ ...e, seq, pool: 'initial', appliedOrder: n - seq })),
    ...files.learnEvents.incoming.map((e, seq) => ({ ...e, seq, pool: 'incoming', appliedOrder: null })),
  ]);

  const graph = buildGraphSeed(files);
  await replaceRaw(GRAPH_COLLECTIONS.nodes, graph.nodes);
  await replaceRaw(GRAPH_COLLECTIONS.edges, graph.edges);
  await replaceRaw(GRAPH_COLLECTIONS.supplierRegistry, graph.supplierRegistry);
  await replaceRaw(GRAPH_COLLECTIONS.suppliersRaw, graph.suppliersRaw);

  await PackageModel.replaceOne({ _id: EXAMPLE_ID }, examplePackage(files), { upsert: true });
}

/**
 * Load the seed into MongoDB when its version differs from the stored one (or
 * when forced). Never touches user packages; owns the example package.
 */
export async function runSeed(opts: { seedDir: string; force?: boolean }): Promise<{ seeded: boolean; version: number }> {
  const files = loadSeedFiles(opts.seedDir);
  const state = await SeedStateModel.findById('seed').lean();
  if (!opts.force && state?.version === files.version) {
    if (!(await PackageModel.exists({ _id: EXAMPLE_ID }))) await PackageModel.create(examplePackage(files));
    return { seeded: false, version: files.version };
  }
  await seedAll(files);
  await SeedStateModel.replaceOne({ _id: 'seed' }, { _id: 'seed', version: files.version, seededAt: new Date() }, { upsert: true });
  return { seeded: true, version: files.version };
}
