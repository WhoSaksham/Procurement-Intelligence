import type { Answer, Step } from '../analysis/types.js';
import { ContentModel } from '../content/model.js';
import { AnswerModel } from './model.js';

// Moved from the web app's views/ask/data.ts. No model is called: each prepared
// claim carries the passage it was checked against and its entailment score.

/** Instruction-like text is refused before anything is searched or generated. */
export const INJECTION =
  /\b(ignore|disregard|forget)\b.{0,30}\b(previous|above|prior|earlier|all)\b|\bsystem prompt\b|\byou are now\b|\bact as\b|\bpretend\b/i;

export const steps = (n: number, supportMin: number): Step[] => [
  { name: 'Rewrite the question for search', tool: 'planner', detail: 'Expanded with procurement synonyms and the working package context.' },
  { name: 'Search documents and records', tool: 'hybrid search + SQL', detail: `${n * 9} candidate passages from the document index and contract awards.` },
  { name: 'Rerank', tool: 'cross-encoder', detail: `${n + 3} passages kept above the relevance threshold.` },
  { name: 'Draft the answer from kept passages only', tool: 'generator', detail: `${n} claims drafted, each pointing at a passage.` },
  { name: 'Check each claim against its passage', tool: 'entailment model', detail: `Claims below ${supportMin} support are removed.` },
];

/** The prepared answer sharing the most keywords with the question. */
export function match(q: string, answers: Answer[]): Answer | null {
  const t = q.toLowerCase();
  let best: Answer | null = null;
  let score = 0;
  for (const a of answers) {
    const s = a.keys.filter((k) => t.includes(k)).length;
    if (s > score) {
      best = a;
      score = s;
    }
  }
  return best;
}

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
  | { blocked: true }
  | { blocked: false; answer: (Answer & { claims: (Answer['claims'][number] & { kept: boolean })[] }) | null; steps: Step[]; supportMin: number };

export async function ask(q: string): Promise<AskResult> {
  if (INJECTION.test(q)) return { blocked: true };
  const [all, min] = await Promise.all([answers(), supportMin()]);
  const a = match(q, all);
  return {
    blocked: false,
    answer: a && { ...a, claims: a.claims.map((c) => ({ ...c, kept: c.support >= min })) },
    steps: steps(a?.claims.length ?? 0, min),
    supportMin: min,
  };
}
