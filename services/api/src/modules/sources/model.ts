import { model, Schema } from 'mongoose';
import type { Source } from '../analysis/types.js';

/** `seq` is the position in the evidence catalogue; citation numbers follow it. */
export type SourceDoc = Source & { _id: string; seq: number };

export const SourceModel = model<SourceDoc>(
  'Source',
  new Schema<SourceDoc>(
    {
      _id: String,
      seq: { type: Number, required: true, index: true },
      layer: { type: String, required: true, enum: ['ledger', 'procedure', 'retrospective'] },
      kind: { type: String, required: true },
      title: { type: String, required: true },
      project: { type: String, required: true },
      date: { type: String, required: true },
      locator: { type: String, required: true },
      before: String,
      quote: { type: String, required: true },
      after: String,
    },
    { collection: 'sources', versionKey: false },
  ),
);

export const toSource = ({ _id, seq: _seq, ...s }: SourceDoc): Source & { id: string } => ({ id: _id, ...s });
