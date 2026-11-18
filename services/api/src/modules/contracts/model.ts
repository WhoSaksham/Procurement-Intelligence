import { model, Schema } from 'mongoose';
import type { Contract, Road } from '../analysis/types.js';

const { Mixed } = Schema.Types;

/** Portfolio contracts under supervision (seeded; read-only at runtime). */
export type ContractDoc = Omit<Contract, 'id'> & { _id: string };

export const ContractModel = model<ContractDoc>(
  'Contract',
  new Schema<ContractDoc>(
    {
      _id: String,
      title: { type: String, required: true },
      supplier: { type: String, required: true },
      value: { type: Number, required: true },
      signed: { type: String, required: true },
      planned: { type: Number, required: true },
      actual: { type: Number, required: true },
      warning: { type: Number, required: true, index: true },
      mapped: Boolean,
      signals: Mixed,
      milestones: Mixed,
    },
    { collection: 'contracts', versionKey: false },
  ),
);

export const toContract = ({ _id, ...c }: ContractDoc): Contract => ({ id: _id, ...c });

/** Road alignment and chainage segments, keyed by contract id. */
export type RoadDoc = Road & { _id: string };

export const RoadModel = model<RoadDoc>(
  'Road',
  new Schema<RoadDoc>({ _id: String, ends: [String], cite: [String], lengthKm: { type: Number, required: true }, segments: Mixed }, { collection: 'roads', versionKey: false }),
);
