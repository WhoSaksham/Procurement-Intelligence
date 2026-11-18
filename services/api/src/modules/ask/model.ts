import { model, Schema } from 'mongoose';
import type { Answer } from '../analysis/types.js';

/** A prepared answer; `seq` keeps the seed order (used for suggested questions). */
export type AnswerDoc = Answer & { seq: number };

export const AnswerModel = model<AnswerDoc>(
  'Answer',
  new Schema<AnswerDoc>(
    { seq: { type: Number, required: true, unique: true }, q: { type: String, required: true }, keys: [String], claims: Schema.Types.Mixed },
    { collection: 'answers', versionKey: false },
  ),
);
