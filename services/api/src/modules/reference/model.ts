import { model, Schema } from 'mongoose';
import type { Country, ReferenceData } from '../analysis/types.js';

const { Mixed } = Schema.Types;

/** Single document `_id: 'reference'`: sectors, methods, defaults, layers, rating scale, ISR history. */
export interface ReferenceDoc extends ReferenceData {
  _id: 'reference';
}

export const ReferenceModel = model<ReferenceDoc>(
  'Reference',
  new Schema<ReferenceDoc>(
    {
      _id: { type: String, default: 'reference' },
      sectors: [String],
      categories: [String],
      methods: Mixed,
      defaultPackage: Mixed,
      defaultCriteria: Mixed,
      layers: Mixed,
      ratingScale: [String],
      ratingNames: Mixed,
      isrHistory: Mixed,
    },
    { collection: 'reference', versionKey: false, minimize: false },
  ),
);

export type CountryDoc = Omit<Country, 'id' | 'custom'> & { _id: string };

export const CountryModel = model<CountryDoc>(
  'Country',
  new Schema<CountryDoc>(
    {
      _id: String,
      name: { type: String, required: true },
      region: { type: String, required: true },
      cpia: { type: Number, required: true },
      rq: { type: Number, required: true },
      fcv: { type: Boolean, required: true },
      cpiaImputed: { type: Boolean, required: true },
    },
    { collection: 'countries', versionKey: false },
  ),
);

export const toCountry = ({ _id, ...c }: CountryDoc): Country => ({ id: _id, ...c });
