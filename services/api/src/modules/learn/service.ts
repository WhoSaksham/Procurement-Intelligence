import { HttpProblem } from '../../http/problem.js';
import type { LearnEvent } from '../analysis/types.js';
import { LearnEventModel } from './model.js';

/** Date stamped on events received during the demo (matches the original app). */
const RECEIVED_ON = '2025-11-01';

export interface LearnState {
  events: (LearnEvent & { fresh: boolean })[];
  remaining: number;
}

export async function learnState(): Promise<LearnState> {
  const [applied, remaining] = await Promise.all([
    LearnEventModel.find({ appliedOrder: { $ne: null } }).sort({ appliedOrder: -1 }).lean(),
    LearnEventModel.countDocuments({ pool: 'incoming', appliedOrder: null }),
  ]);
  return {
    events: applied.map((e, i) => ({
      ...(e.when ? { when: e.when } : {}),
      layer: e.layer,
      title: e.title,
      updates: e.updates,
      fresh: i === 0 && e.pool === 'incoming',
    })),
    remaining,
  };
}

/** Apply the next queued event. Atomic, so concurrent calls apply different events. */
export async function applyNext(): Promise<LearnState> {
  const next = await LearnEventModel.findOneAndUpdate(
    { pool: 'incoming', appliedOrder: null },
    [{ $set: { appliedOrder: { $add: [{ $multiply: [{ $toLong: '$$NOW' }, 1000] }, '$seq'] }, when: RECEIVED_ON } }],
    { sort: { seq: 1 }, returnDocument: 'after', updatePipeline: true },
  );
  if (!next) throw new HttpProblem(409, 'version-conflict', 'No more sample events');
  return learnState();
}

export async function resetEvents(): Promise<LearnState> {
  await LearnEventModel.updateMany({ pool: 'incoming' }, { $set: { appliedOrder: null }, $unset: { when: 1 } });
  return learnState();
}
