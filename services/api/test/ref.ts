import type { Ref } from '../src/modules/analysis/model.js';
import type { Contract, Country, Criteria, Package, ReferenceData } from '../src/modules/analysis/types.js';
import { readSeed } from './seed-dir.js';

const reference = readSeed<ReferenceData>('reference.json');

/** Reference data as the API loads it, straight from data/seed. */
export const REF: Ref = { countries: readSeed<Country[]>('countries.json'), methods: reference.methods };
export const DEFAULT_PACKAGE: Package = reference.defaultPackage;
export const DEFAULT_CRITERIA: Criteria = reference.defaultCriteria;
export const PORTFOLIO: Contract[] = readSeed<Contract[]>('contracts.json');
