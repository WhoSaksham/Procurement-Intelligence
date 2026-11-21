import { model, Schema } from 'mongoose';

interface UsageDoc {
  _id: string;
  n: number;
}

/** Questions sent to the model per UTC day (`<key>:<YYYY-MM-DD>`), shared by every API instance. */
export const AskUsageModel = model<UsageDoc>('AskUsage', new Schema<UsageDoc>({ _id: String, n: { type: Number, default: 0 } }, { collection: 'askUsage', versionKey: false }));

export const COOLDOWN_MS = 60_000;
const MINUTE = 60_000;

/**
 * Keeps the free-tier quota safe. All traffic arrives through the web proxy, so limits
 * are global, not per client. `take()` answers null when a question may go to the model.
 */
export class AskLimits {
  private recent: number[] = [];
  private coolUntil = 0;
  private readonly now: () => number;

  constructor(private readonly o: { rpm: number; daily: number; now?: () => number; key?: string }) {
    this.now = o.now ?? Date.now;
  }

  async take(): Promise<null | 'limit' | 'cooldown'> {
    const t = this.now();
    if (t < this.coolUntil) return 'cooldown';
    this.recent = this.recent.filter((x) => t - x < MINUTE);
    if (this.recent.length >= this.o.rpm) return 'limit';
    // Reserve the slot before awaiting, so concurrent questions cannot all pass the check.
    this.recent.push(t);
    const day = new Date(t).toISOString().slice(0, 10);
    const doc = await AskUsageModel.findOneAndUpdate({ _id: `${this.o.key ?? 'ask'}:${day}` }, { $inc: { n: 1 } }, { upsert: true, new: true }).lean();
    if ((doc?.n ?? 0) > this.o.daily) {
      const i = this.recent.indexOf(t);
      if (i >= 0) this.recent.splice(i, 1);
      return 'limit';
    }
    return null;
  }

  /** After the model reports its quota is used up, stop calling it for a minute. */
  tripCooldown(): void {
    this.coolUntil = this.now() + COOLDOWN_MS;
  }
}
