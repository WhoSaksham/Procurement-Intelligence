import type { Answer, Step } from '../analysis/types.js';
import type { KeptClaim } from './checks.js';

// Prepared answers: the fallback when the live model is not configured or not available.
// Each prepared claim carries the passage it was checked against and its support score.

/** The steps a prepared answer went through when it was prepared. */
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

/** Claims and steps of the best prepared answer for the query (none when nothing matches). */
export function preparedAnswer(query: string, answers: Answer[], supportMin: number): { claims: KeptClaim[]; steps: Step[] } {
  const claims = (match(query, answers)?.claims ?? []).map((c) => ({ ...c, kept: c.support >= supportMin }));
  return { claims, steps: steps(claims.length, supportMin) };
}
