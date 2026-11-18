import { model, Schema } from 'mongoose';
import type { LearnEvent } from '../analysis/types.js';

/**
 * A feedback event. `initial` events start applied; `incoming` events wait in
 * a queue until "Receive next event". `appliedOrder` orders the applied list
 * (higher = newer); null means still queued.
 */
export type LearnEventDoc = Omit<LearnEvent, 'fresh'> & {
  seq: number;
  pool: 'initial' | 'incoming';
  appliedOrder: number | null;
};

export const LearnEventModel = model<LearnEventDoc>(
  'LearnEvent',
  new Schema<LearnEventDoc>(
    {
      seq: { type: Number, required: true },
      pool: { type: String, required: true, enum: ['initial', 'incoming'] },
      appliedOrder: { type: Number, default: null },
      when: String,
      layer: { type: String, required: true },
      title: { type: String, required: true },
      updates: Schema.Types.Mixed,
    },
    { collection: 'learnEvents', versionKey: false },
  ).index({ pool: 1, appliedOrder: 1, seq: 1 }),
);
