import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Answer, Contract, Country, LearnEvent, ReferenceData, Road, Source } from '../modules/analysis/types.js';
import type { SeedGraphNode } from './derive-graph.js';

export interface SeedFiles {
  version: number;
  reference: ReferenceData;
  countries: Country[];
  sources: Record<string, Source>;
  contracts: Contract[];
  roads: Record<string, Road>;
  content: { package: Record<string, unknown>; pipeline: Record<string, unknown>; learn: Record<string, unknown> };
  answers: { supportMin: number; answers: Answer[] };
  learnEvents: { initial: LearnEvent[]; incoming: LearnEvent[] };
  graph: {
    nodes: SeedGraphNode[];
    edges: Record<string, unknown>[];
    supplierRegistry: Record<string, unknown>[];
    suppliersRaw: Record<string, unknown>[];
  };
}

/** Read the seed directory (repo-root `data/seed`). Fails loudly on a missing or malformed file. */
export function loadSeedFiles(dir: string): SeedFiles {
  const json = <T>(rel: string): T => {
    const file = path.join(dir, rel);
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as T;
    } catch (e) {
      throw new Error(`Seed file ${file} could not be read: ${(e as Error).message}`);
    }
  };
  const version = Number(readFileSync(path.join(dir, 'VERSION'), 'utf8').trim());
  if (!Number.isInteger(version) || version < 1) throw new Error(`Seed VERSION must be a positive integer, got "${version}"`);
  return {
    version,
    reference: json('reference.json'),
    countries: json('countries.json'),
    sources: json('sources.json'),
    contracts: json('contracts.json'),
    roads: json('roads.json'),
    content: {
      package: json('content/package.json'),
      pipeline: json('content/pipeline.json'),
      learn: json('content/learn.json'),
    },
    answers: json('answers.json'),
    learnEvents: json('learn-events.json'),
    graph: {
      nodes: json('graph/nodes.json'),
      edges: json('graph/edges.json'),
      supplierRegistry: json('graph/supplier_registry.json'),
      suppliersRaw: json('graph/suppliers_raw.json'),
    },
  };
}
