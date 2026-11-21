import type { Callbacks } from '@langchain/core/callbacks/manager';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { Answer, Step } from '../analysis/types.js';
import { decide, precheck, type KeptClaim, type Prechecked } from './checks.js';
import { ModelError, type AskModel, type HistoryTurn, type ModelErrorKind } from './model-port.js';
import { retrieve, type Passage } from './retrieve.js';
import { preparedAnswer } from './prepared.js';

export const RUN_BUDGET_MS = 20_000;
export const TOP_K = 8;

export const NOTICE_NOT_CONFIGURED = 'Live model not configured — showing a prepared answer.';
export const NOTICE_UNAVAILABLE = 'Live model unavailable — showing a prepared answer.';

export interface RunInput {
  q: string;
  history: HistoryTurn[];
  pkg: Passage | null;
  sources: Passage[];
  answers: Answer[];
  supportMin: number;
  model: AskModel | null;
  /** Set when the model must not be called (over a limit, or cooling down after a quota error). */
  unavailable?: 'limit' | 'cooldown';
  budgetMs?: number;
  callbacks?: Callbacks;
  metadata?: Record<string, unknown>;
  /** LangSmith run id for the whole run, so a log line leads to its trace. */
  runId?: string;
}

export interface RunResult {
  mode: 'llm' | 'prepared';
  model?: string;
  notice?: string;
  outOfScope?: true;
  standalone: string;
  claims: KeptClaim[];
  steps: Step[];
  failure?: ModelErrorKind;
  /** The underlying error message, for logs only (never shown to users). */
  failureDetail?: string;
}

const State = Annotation.Root({
  standalone: Annotation<string | undefined>,
  outOfScope: Annotation<boolean | undefined>,
  passages: Annotation<Passage[] | undefined>,
  prechecked: Annotation<Prechecked[] | undefined>,
  claims: Annotation<KeptClaim[] | undefined>,
  failure: Annotation<ModelErrorKind | undefined>,
  failureDetail: Annotation<string | undefined>,
  fallback: Annotation<{ claims: KeptClaim[]; notice: string } | undefined>,
  steps: Annotation<Step[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
});
type S = typeof State.State;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** One Ask run: rewrite (follow-ups only) → retrieve → draft → check → score, or prepared answers on any failure. */
export async function runAsk(i: RunInput): Promise<RunResult> {
  const budget = AbortSignal.timeout(i.budgetMs ?? RUN_BUDGET_MS);
  const model = i.unavailable ? null : i.model;

  const notice = () => (i.model || i.unavailable ? NOTICE_UNAVAILABLE : NOTICE_NOT_CONFIGURED);
  /** The rewritten question when there is one, else the previous question plus this one (so follow-ups still match). */
  const fallbackQuery = (standalone: string | undefined) => (standalone ?? [i.history.at(-1)?.q, i.q].filter(Boolean).join(' ')).slice(0, 1000);

  /** Time a model call; any failure becomes a `failure` the graph routes to prepared answers. */
  async function modelStep<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T; ms: number } | { ok: false; kind: ModelErrorKind; detail: string }> {
    const t = performance.now();
    try {
      const value = await fn();
      return { ok: true, value, ms: Math.round(performance.now() - t) };
    } catch (e) {
      const cause = e instanceof ModelError ? e.cause : e;
      const detail = String(cause instanceof Error ? cause.message : cause ?? e).slice(0, 500);
      return { ok: false, kind: budget.aborted ? 'timeout' : e instanceof ModelError ? e.kind : 'upstream', detail };
    }
  }

  const graph = new StateGraph(State)
    .addNode('contextualise', async (): Promise<Partial<S>> => {
      const r = await modelStep(() => model!.contextualise({ history: i.history, q: i.q }, budget));
      if (!r.ok) return { failure: r.kind, failureDetail: r.detail };
      const { standalone, inScope } = r.value;
      return {
        standalone,
        outOfScope: !inScope,
        steps: [{ name: 'Rewrite follow-up', tool: model!.name, detail: `Rewrote as “${standalone}”${inScope ? '' : ', out of scope'} (${r.ms} ms).` }],
      };
    })
    .addNode('retrieve', (s: S): Partial<S> => {
      const found = retrieve(s.standalone ?? i.q, i.sources, TOP_K);
      const passages = [...found.map((f) => f.passage), ...(i.pkg ? [i.pkg] : [])];
      const ids = found.map((f) => f.passage.id).join(', ');
      return {
        standalone: s.standalone ?? i.q,
        passages,
        steps: [
          {
            name: 'Find passages',
            tool: 'BM25 keyword search',
            detail: `${plural(found.length, 'passage')} of ${i.sources.length} matched${ids ? ` (${ids})` : ''}${i.pkg ? ', plus your package' : ''}.`,
          },
        ],
      };
    })
    .addNode('draft', async (s: S): Promise<Partial<S>> => {
      const r = await modelStep(() => model!.draft({ q: s.standalone!, passages: s.passages! }, budget));
      if (!r.ok) return { failure: r.kind, failureDetail: r.detail };
      if (r.value.outOfScope && !i.history.length) {
        return { outOfScope: true, steps: [{ name: 'Draft from passages', tool: model!.name, detail: `Out of scope; nothing drafted (${r.ms} ms).` }] };
      }
      const given = new Map(s.passages!.map((p) => [p.id, p]));
      const prechecked = precheck(r.value.claims, given);
      const failed = prechecked.filter((c) => c.reason);
      return {
        prechecked,
        steps: [
          { name: 'Draft from passages', tool: model!.name, detail: `${plural(r.value.claims.length, 'claim')} drafted from ${plural(s.passages!.length, 'passage')} (${r.ms} ms).` },
          {
            name: 'Check citations and numbers',
            tool: 'rules',
            detail: failed.length
              ? `${plural(failed.length, 'claim')} failed: ${[...new Set(failed.map((c) => c.reason))].join(', ')}.`
              : `Every claim cites a passage it was given, and its numbers appear there.`,
          },
        ],
      };
    })
    .addNode('verify', async (s: S): Promise<Partial<S>> => {
      const pre = s.prechecked!;
      const byId = new Map(s.passages!.map((p) => [p.id, p]));
      const toScore = pre.map((c, n) => ({ c, n })).filter(({ c }) => !c.reason);
      let scores = new Map<number, number>();
      let ms = 0;
      if (toScore.length) {
        const r = await modelStep(() =>
          model!.verify({ claims: toScore.map(({ c, n }) => ({ i: n, text: c.text, passages: c.cite.map((id) => byId.get(id)!) })) }, budget),
        );
        if (!r.ok) return { failure: r.kind, failureDetail: r.detail };
        scores = new Map(r.value.scores.map((x) => [x.i, x.support]));
        ms = r.ms;
      }
      const claims = decide(pre, scores, i.supportMin);
      const kept = claims.filter((c) => c.kept).length;
      return {
        claims,
        steps: [
          {
            name: 'Score support',
            tool: toScore.length ? model!.name : 'skipped',
            detail: `${kept} of ${plural(claims.length, 'claim')} at or above ${i.supportMin} support; ${claims.length - kept} removed${ms ? ` (${ms} ms)` : ''}.`,
          },
        ],
      };
    })
    .addNode('prepared', (s: S): Partial<S> => {
      // Match on the rewritten question when there is one, else the previous question plus this one.
      const p = preparedAnswer(fallbackQuery(s.standalone), i.answers, i.supportMin);
      return { fallback: { claims: p.claims, notice: notice() }, steps: p.steps };
    })
    .addConditionalEdges(START, () => (!model ? 'prepared' : i.history.length ? 'contextualise' : 'retrieve'))
    .addConditionalEdges('contextualise', (s: S) => (s.failure ? 'prepared' : s.outOfScope ? END : 'retrieve'))
    .addConditionalEdges('retrieve', (s: S) => (s.passages!.length ? 'draft' : END))
    .addConditionalEdges('draft', (s: S) => (s.failure ? 'prepared' : s.outOfScope || !s.prechecked!.length ? END : 'verify'))
    .addConditionalEdges('verify', (s: S) => (s.failure ? 'prepared' : END))
    .addEdge('prepared', END)
    .compile();

  let s: S;
  try {
    s = await graph.invoke({}, { callbacks: i.callbacks, runName: 'ask', metadata: i.metadata, ...(i.runId ? { runId: i.runId } : {}) });
  } catch {
    // A bug in a node must not break Ask: answer from prepared answers.
    const p = preparedAnswer(fallbackQuery(undefined), i.answers, i.supportMin);
    return { mode: 'prepared', notice: notice(), standalone: fallbackQuery(undefined), claims: p.claims, steps: p.steps, failure: 'upstream' };
  }

  if (s.fallback) {
    return {
      mode: 'prepared',
      notice: s.fallback.notice,
      // What the prepared answer was matched on, so the next follow-up keeps the topic.
      standalone: fallbackQuery(s.standalone),
      claims: s.fallback.claims,
      steps: s.steps,
      ...(s.failure ? { failure: s.failure } : {}),
      ...(s.failureDetail ? { failureDetail: s.failureDetail } : {}),
    };
  }
  return {
    mode: 'llm',
    model: model!.name,
    standalone: s.standalone ?? i.q,
    claims: s.claims ?? [],
    steps: s.steps,
    ...(s.outOfScope ? { outOfScope: true as const } : {}),
  };
}
