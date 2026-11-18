import { model, Schema } from 'mongoose';
import type { Contract, Country, Criteria, Package, Signoff } from '../analysis/types.js';

const { Mixed } = Schema.Types;

export const EXAMPLE_ID = 'example';

/** A saved package: the analyst's working scenario, with optimistic-concurrency `version`. */
export interface PackageDoc {
  _id: string;
  example: boolean;
  pkg: Package;
  criteria: Criteria;
  countries: Country[];
  contracts: Contract[];
  signoff: Signoff | null;
  version: number;
  /** Last allocated own-contract number (USR-nn). */
  contractSeq: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export const PackageModel = model<PackageDoc>(
  'Package',
  new Schema<PackageDoc>(
    {
      _id: String,
      example: { type: Boolean, required: true, default: false },
      pkg: { type: Mixed, required: true },
      criteria: { type: Mixed, required: true },
      countries: { type: Mixed, default: [] },
      contracts: { type: Mixed, default: [] },
      signoff: { type: Mixed, default: null },
      version: { type: Number, required: true, default: 1 },
      contractSeq: { type: Number, required: true, default: 0 },
    },
    { collection: 'packages', versionKey: false, timestamps: true, minimize: false },
  ).index({ updatedAt: -1 }),
);
