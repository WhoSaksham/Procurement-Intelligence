import { model, Schema } from 'mongoose';

/** Which seed version is loaded (`_id: 'seed'`). */
export const SeedStateModel = model<{ _id: string; version: number; seededAt: Date }>(
  'SeedState',
  new Schema({ _id: String, version: Number, seededAt: Date }, { collection: 'seedState', versionKey: false }),
);
