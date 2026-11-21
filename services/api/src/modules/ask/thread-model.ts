import { model, Schema } from 'mongoose';
import type { Step } from '../analysis/types.js';
import type { KeptClaim } from './checks.js';

export const MAX_TURNS = 20;
export const THREAD_TTL_SECONDS = 30 * 24 * 3600;

/** Everything needed to redraw a turn without running anything again. */
export interface StoredTurn {
  q: string;
  standalone: string;
  mode: 'llm' | 'prepared';
  model?: string;
  notice?: string;
  outOfScope?: boolean;
  claims: KeptClaim[];
  steps: Step[];
  /** The package passage exactly as the claims were checked against it. */
  pkg?: { name: string; text: string };
  at: Date;
}

export interface ThreadDoc {
  _id: string;
  turns: StoredTurn[];
  createdAt?: Date;
  updatedAt?: Date;
}

const schema = new Schema<ThreadDoc>(
  { _id: String, turns: { type: Schema.Types.Mixed, default: () => [] } },
  { collection: 'askThreads', versionKey: false, timestamps: true },
);
// Conversations are anonymous; they go 30 days after the last question.
schema.index({ updatedAt: 1 }, { expireAfterSeconds: THREAD_TTL_SECONDS });

export const ThreadModel = model<ThreadDoc>('AskThread', schema);
