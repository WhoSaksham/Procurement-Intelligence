import type { Ref } from '../analysis/model.js';
import type { Country, ReferenceData } from '../analysis/types.js';
import { CountryModel, ReferenceModel, toCountry } from './model.js';

export type ReferenceView = ReferenceData & { countries: Country[] };

/** Reference data plus the built-in countries, in seed order. */
export async function loadReference(): Promise<ReferenceView> {
  const [ref, countries] = await Promise.all([ReferenceModel.findById('reference').lean(), CountryModel.find().lean()]);
  if (!ref) throw new Error('Reference data is missing: run the seeder');
  const { _id: _ignored, ...data } = ref;
  return { ...data, countries: countries.map(toCountry) };
}

/** What the model needs from reference data. */
export async function loadRef(): Promise<Ref> {
  const r = await loadReference();
  return { countries: r.countries, methods: r.methods };
}
