import type { Draft } from './checks.js';
import type { Passage } from './retrieve.js';

/** One earlier turn as the model sees it: the question and only the claims that were kept. */
export interface HistoryTurn {
  q: string;
  kept: string[];
}

export interface ClaimToVerify {
  i: number;
  text: string;
  passages: Passage[];
}

/** What the Ask pipeline needs from a language model. Real: Gemini via LangChain; tests and e2e: fakes. */
export interface AskModel {
  name: string;
  contextualise(i: { history: HistoryTurn[]; q: string }, signal: AbortSignal): Promise<{ standalone: string; inScope: boolean }>;
  draft(i: { q: string; passages: Passage[] }, signal: AbortSignal): Promise<{ outOfScope: boolean; claims: Draft[] }>;
  verify(i: { claims: ClaimToVerify[] }, signal: AbortSignal): Promise<{ scores: { i: number; support: number }[] }>;
}

export type ModelErrorKind = 'quota' | 'timeout' | 'invalid' | 'upstream';

export class ModelError extends Error {
  constructor(
    readonly kind: ModelErrorKind,
    cause?: unknown,
  ) {
    super(`model ${kind}`, { cause });
    this.name = 'ModelError';
  }
}
