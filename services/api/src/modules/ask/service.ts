import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { HttpProblem } from '../../http/problem.js';
import type { Answer } from '../analysis/types.js';
import { ContentModel } from '../content/model.js';
import { newId, packageForAsk } from '../packages/service.js';
import { SourceModel, toSource } from '../sources/model.js';
import { runAsk } from './graph.js';
import type { AskLimits } from './limits.js';
import { AnswerModel } from './model.js';
import type { AskModel } from './model-port.js';
import type { askTracer } from './tracing.js';
import { packagePassage } from './package-passage.js';
import { HISTORY_TURNS } from './prompts.js';
import { sourcePassage } from './retrieve.js';
import { MAX_TURNS, ThreadModel, type StoredTurn, type ThreadDoc } from './thread-model.js';

/** Instruction-like text is refused before anything is searched or generated. */
export const INJECTION =
  /\b(ignore|disregard|forget)\b.{0,30}\b(previous|above|prior|earlier|all)\b|\bsystem prompt\b|\byou are now\b|\bact as\b|\bpretend\b/i;

export async function supportMin(): Promise<number> {
  const doc = await ContentModel.findById('ask').lean();
  return (doc?.data as { supportMin?: number } | undefined)?.supportMin ?? 0.75;
}

const answers = async (): Promise<Answer[]> =>
  (await AnswerModel.find().sort({ seq: 1 }).lean()).map(({ q, keys, claims }) => ({ q, keys, claims }));

export async function questions() {
  return { questions: (await answers()).map((a) => a.q), supportMin: await supportMin() };
}

export type AskResult =
  | { blocked: true; threadId?: string }
  | { blocked: false; threadId: string; turn: StoredTurn & { index: number }; supportMin: number };

export interface AskContext {
  model: AskModel | null;
  /** Null for the e2e stand-in model: limits protect the real model's quota. */
  limits: AskLimits | null;
  /** Makes a LangSmith tracer per run; null when tracing is off. */
  tracer: ReturnType<typeof askTracer> | null;
  log: Logger;
  requestId?: string;
}

export async function getThread(id: string): Promise<{ id: string; turns: StoredTurn[] }> {
  const t = await ThreadModel.findById(id).lean<ThreadDoc>();
  if (!t) throw new HttpProblem(404, 'not-found', `No conversation ${id}`);
  return { id: t._id, turns: t.turns };
}

/** Save the turn on the thread, or on a new thread when there is none or it is full. */
async function save(threadId: string | null, turn: StoredTurn): Promise<{ threadId: string; index: number }> {
  if (threadId) {
    const t = await ThreadModel.findOneAndUpdate(
      { _id: threadId, [`turns.${MAX_TURNS - 1}`]: { $exists: false } },
      { $push: { turns: turn } },
      { new: true, projection: { n: { $size: '$turns' } } },
    ).lean<{ n: number }>();
    if (t) return { threadId, index: t.n - 1 };
  }
  const created = await ThreadModel.create({ _id: newId(), turns: [turn] });
  return { threadId: created._id, index: 0 };
}

export async function ask(input: { q: string; threadId?: string; packageId?: string }, ctx: AskContext): Promise<AskResult> {
  if (INJECTION.test(input.q)) return { blocked: true, ...(input.threadId ? { threadId: input.threadId } : {}) };

  let thread: ThreadDoc | null = null;
  if (input.threadId) {
    thread = await ThreadModel.findById(input.threadId).lean<ThreadDoc>();
    if (!thread) throw new HttpProblem(404, 'not-found', `No conversation ${input.threadId}`);
    if (thread.turns.length >= MAX_TURNS) thread = null;
  }
  const history = (thread?.turns ?? []).slice(-HISTORY_TURNS).map((t) => ({ q: t.standalone, kept: t.claims.filter((c) => c.kept).map((c) => c.text) }));

  const [view, sourceDocs, all, min, unavailable] = await Promise.all([
    input.packageId ? packageForAsk(input.packageId) : null,
    SourceModel.find().sort({ seq: 1 }).lean(),
    answers(),
    supportMin(),
    ctx.model && ctx.limits ? ctx.limits.take() : null,
  ]);
  const pkg = view ? packagePassage(view) : null;

  const runId = randomUUID();
  const callbacks = ctx.tracer ? [ctx.tracer()] : undefined;
  const r = await runAsk({
    q: input.q,
    history,
    pkg,
    sources: sourceDocs.map((d) => sourcePassage(toSource(d))),
    answers: all,
    supportMin: min,
    model: ctx.model,
    ...(unavailable ? { unavailable } : {}),
    callbacks,
    runId,
    metadata: { threadId: input.threadId ?? null, packageId: input.packageId ?? null, requestId: ctx.requestId },
  });

  if (r.failure === 'quota') ctx.limits?.tripCooldown();
  if (r.failure) ctx.log.warn({ event: 'askFallback', kind: r.failure, detail: r.failureDetail, askRun: runId }, 'Ask fell back to prepared answers');
  if (unavailable) ctx.log.info({ event: 'askFallback', kind: unavailable }, 'Ask model not called');

  const turn: StoredTurn = {
    q: input.q,
    standalone: r.standalone,
    mode: r.mode,
    ...(r.model ? { model: r.model } : {}),
    ...(r.notice ? { notice: r.notice } : {}),
    ...(r.outOfScope ? { outOfScope: true } : {}),
    claims: r.claims,
    steps: r.steps,
    ...(pkg && view ? { pkg: { name: view.pkg.name, text: pkg.text } } : {}),
    at: new Date(),
  };
  const saved = await save(thread?._id ?? null, turn);
  for (const c of r.claims.filter((x) => !x.kept)) {
    ctx.log.info({ event: 'askRemoved', threadId: saved.threadId, text: c.text, cite: c.cite, support: c.support, reason: c.reason }, 'Ask removed a claim');
  }
  if (ctx.tracer) ctx.log.info({ event: 'askRun', askRun: runId, threadId: saved.threadId }, 'Ask traced in LangSmith');

  return { blocked: false, threadId: saved.threadId, turn: { ...turn, index: saved.index }, supportMin: min };
}
