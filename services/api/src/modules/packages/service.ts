import { randomBytes } from 'node:crypto';
import { HttpProblem } from '../../http/problem.js';
import { analyse, type Analysis } from '../analysis/analyse.js';
import { buildContract, signoffBrief } from '../analysis/contract.js';
import { benchmarkCriteria, type Ref } from '../analysis/model.js';
import type { Contract, ContractDraft, Country, Criteria, Package, Signoff } from '../analysis/types.js';
import { ContractModel, toContract } from '../contracts/model.js';
import { loadReference } from '../reference/service.js';
import { EXAMPLE_ID, PackageModel, type PackageDoc } from './model.js';
import { defaultScenario, exportFileName, exportScenario, parseImport, type Defaults, type Scenario } from './scenario.js';

export interface PackageView extends Scenario {
  id: string;
  example: boolean;
  version: number;
  updatedAt: string;
  analysis: Analysis;
}

const newId = () => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(randomBytes(10), (b) => alphabet[b % 36]).join('');
};

const scenarioOf = (d: PackageDoc): Scenario => ({
  pkg: d.pkg,
  criteria: d.criteria,
  countries: d.countries ?? [],
  contracts: d.contracts ?? [],
  signoff: d.signoff ?? null,
});

async function context(): Promise<{ ref: Ref; defaults: Defaults }> {
  const r = await loadReference();
  return {
    ref: { countries: r.countries, methods: r.methods },
    defaults: { defaultPackage: r.defaultPackage, defaultCriteria: r.defaultCriteria, methods: r.methods, countries: r.countries },
  };
}

const toView = (d: PackageDoc, ref: Ref): PackageView => ({
  id: d._id,
  example: d.example,
  version: d.version,
  ...scenarioOf(d),
  updatedAt: (d.updatedAt ?? new Date(0)).toISOString(),
  analysis: analyse(ref, scenarioOf(d)),
});

async function find(id: string): Promise<PackageDoc> {
  const d = await PackageModel.findById(id).lean<PackageDoc>();
  if (!d) throw new HttpProblem(404, 'not-found', `No package ${id}`);
  return d;
}

const invalid = (path: string, message: string) =>
  new HttpProblem(400, 'validation', 'The request did not pass validation', { errors: [{ path, message }] });

/** Cross-field rules a partial schema cannot express. */
function checkPackage(pkg: Package, countries: Country[], ref: Ref): void {
  if (!ref.methods[pkg.category]?.includes(pkg.method)) throw invalid('pkg.method', `${pkg.method} is not a method for ${pkg.category}`);
  if (!countries.some((c) => c.id === pkg.country) && !ref.countries.some((c) => c.id === pkg.country)) {
    throw invalid('pkg.country', `Unknown country ${pkg.country}; add it to the package first`);
  }
}

export async function listPackages() {
  const docs = await PackageModel.find({}, { pkg: 1, example: 1, signoff: 1, updatedAt: 1 }).sort({ example: -1, updatedAt: -1 }).lean<PackageDoc[]>();
  return {
    items: docs.map((d) => ({
      id: d._id,
      name: d.pkg.name,
      country: d.pkg.country,
      example: d.example,
      signedOff: !!d.signoff,
      updatedAt: (d.updatedAt ?? new Date(0)).toISOString(),
    })),
  };
}

export async function getPackage(id: string): Promise<PackageView> {
  const [d, { ref }] = await Promise.all([find(id), context()]);
  return toView(d, ref);
}

async function insert(s: Scenario, ref: Ref, contractSeq = 0): Promise<PackageView> {
  const doc = await PackageModel.create({ _id: newId(), example: false, ...s, signoff: s.signoff, version: 1, contractSeq });
  return toView(doc.toObject() as PackageDoc, ref);
}

const nextSeq = (contracts: Contract[]) =>
  contracts.reduce((n, c) => Math.max(n, Number(/^USR-(\d+)$/.exec(c.id)?.[1] ?? 0)), 0);

export async function createPackage(input: { fromId?: string; name?: string }): Promise<PackageView> {
  const { ref, defaults } = await context();
  if (input.fromId) {
    const src = await find(input.fromId);
    const s = scenarioOf(src);
    return insert({ ...s, pkg: { ...s.pkg, name: input.name ?? `${s.pkg.name} (copy)` }, signoff: null }, ref, src.contractSeq);
  }
  const s = defaultScenario(defaults);
  return insert({ ...s, pkg: { ...s.pkg, name: input.name ?? s.pkg.name } }, ref);
}

/**
 * Apply a change to a user package if it is still at `version`. The write is
 * conditional on the version, so two writers based on the same version can
 * never both succeed.
 */
async function mutate(id: string, version: number, change: (d: PackageDoc, ctx: { ref: Ref; defaults: Defaults }) => Partial<PackageDoc>): Promise<PackageView> {
  const [current, ctx] = await Promise.all([find(id), context()]);
  if (current.example) throw new HttpProblem(409, 'example-read-only', 'The example package cannot be changed; create a copy first');
  if (current.version !== version) {
    throw new HttpProblem(409, 'version-conflict', `Package was changed elsewhere (now version ${current.version})`, { current: toView(current, ctx.ref) });
  }
  const next = change(current, ctx);
  const updated = await PackageModel.findOneAndUpdate(
    { _id: id, version, example: false },
    { $set: { ...next, version: version + 1 } },
    { returnDocument: 'after' },
  ).lean<PackageDoc>();
  if (updated) return toView(updated, ctx.ref);
  // Lost a race: report what is there now.
  const now = await find(id);
  throw new HttpProblem(409, 'version-conflict', `Package was changed elsewhere (now version ${now.version})`, { current: toView(now, ctx.ref) });
}

export const patchPackage = (id: string, body: { version: number; pkg?: Partial<Package>; criteria?: Partial<Criteria> }) =>
  mutate(id, body.version, (d, { ref }) => {
    const pkg = { ...d.pkg, ...body.pkg };
    checkPackage(pkg, d.countries ?? [], ref);
    return { pkg, criteria: { ...d.criteria, ...body.criteria } };
  });

export const applyBenchmark = (id: string, version: number) =>
  mutate(id, version, (d) => ({ criteria: benchmarkCriteria(d.pkg, d.criteria) }));

export const signOff = (id: string, version: number, name: string) =>
  mutate(id, version, (d): Partial<PackageDoc> => {
    const signoff: Signoff = { name: name.trim(), at: new Date().toISOString(), brief: signoffBrief(d.pkg, d.criteria) };
    return { signoff };
  });

export const resetPackage = async (id: string, version: number) => {
  const example = await find(EXAMPLE_ID);
  return mutate(id, version, () => ({ ...scenarioOf(example), countries: [], contracts: [], signoff: null }));
};

export const upsertCountry = (id: string, countryId: string, version: number, country: Country) => {
  if (country.id !== countryId) throw invalid('country.id', 'Must match the id in the path');
  return mutate(id, version, (d) => ({ countries: [...(d.countries ?? []).filter((c) => c.id !== countryId), { ...country, custom: true }] }));
};

export const removeCountry = (id: string, countryId: string, version: number) =>
  mutate(id, version, (d, { ref }) => {
    const countries = (d.countries ?? []).filter((c) => c.id !== countryId);
    const stillKnown = countries.some((c) => c.id === d.pkg.country) || ref.countries.some((c) => c.id === d.pkg.country);
    // A package pointing at a removed custom country moves to the first built-in country.
    return { countries, pkg: stillKnown ? d.pkg : { ...d.pkg, country: ref.countries[0].id } };
  });

export const addContract = (id: string, version: number, draft: ContractDraft) =>
  mutate(id, version, (d) => {
    const n = Math.max(d.contractSeq ?? 0, nextSeq(d.contracts ?? [])) + 1;
    return { contracts: [...(d.contracts ?? []), buildContract(draft, n)], contractSeq: n };
  });

export const removeContract = (id: string, contractId: string, version: number) =>
  mutate(id, version, (d) => {
    if (!(d.contracts ?? []).some((c) => c.id === contractId)) throw new HttpProblem(404, 'not-found', `No contract ${contractId} in this package`);
    return { contracts: d.contracts.filter((c) => c.id !== contractId) };
  });

export async function deletePackage(id: string): Promise<void> {
  const d = await find(id);
  if (d.example) throw new HttpProblem(409, 'example-read-only', 'The example package cannot be deleted');
  await PackageModel.deleteOne({ _id: id, example: false });
}

export async function exportPackage(id: string): Promise<{ fileName: string; body: string }> {
  const d = await find(id);
  const s = scenarioOf(d);
  return { fileName: exportFileName(s), body: exportScenario(s) };
}

/** Create a new package from a scenario file (text) or an already-parsed object. */
export async function importPackage(input: string | unknown): Promise<PackageView> {
  const { ref, defaults } = await context();
  const text = typeof input === 'string' ? input : JSON.stringify(input ?? null);
  const r = parseImport(text, defaults);
  if (!r.ok) throw new HttpProblem(400, 'validation', r.error);
  return insert(r.scenario, ref, nextSeq(r.scenario.contracts));
}

export async function portfolio(id: string): Promise<{ items: Contract[] }> {
  const [d, seeded] = await Promise.all([find(id), ContractModel.find().lean()]);
  return { items: [...seeded.map(toContract), ...(d.contracts ?? [])].sort((a, b) => b.warning - a.warning) };
}
