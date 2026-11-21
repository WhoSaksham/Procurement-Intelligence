import type { Passage } from './retrieve.js';

export const MAX_CLAIMS = 6;
export const MAX_CLAIM_CHARS = 300;

/** A claim as the model drafted it. */
export interface Draft {
  text: string;
  cite: string[];
}

export type Reason = 'no valid citation' | 'number not in passage' | 'below threshold';

export interface Prechecked extends Draft {
  reason?: Reason;
}

export interface KeptClaim extends Draft {
  support: number;
  kept: boolean;
  reason?: Reason;
}

/** Every number in the text, normalised: thousands separators removed, trailing zero decimals dropped. */
export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    let n = m[0].replace(/,(?=\d{3}\b)/g, '').replace(/,+$/, '');
    if (n.includes('.')) n = n.replace(/0+$/, '').replace(/\.$/, '');
    out.add(n);
  }
  return out;
}

/**
 * Checks that need no model: citations must be passages the model was given, and
 * every number in a claim must appear in a passage it cites.
 */
export function precheck(claims: Draft[], given: Map<string, Passage>): Prechecked[] {
  return claims.slice(0, MAX_CLAIMS).map((c) => {
    const text = c.text.trim().slice(0, MAX_CLAIM_CHARS);
    const cite = [...new Set(c.cite)].filter((id) => given.has(id));
    if (!cite.length) return { text, cite, reason: 'no valid citation' };
    // The model sees each passage's title as well as its text, so both count.
    const found = new Set(cite.flatMap((id) => [...numbersIn(`${given.get(id)!.title} ${given.get(id)!.text}`)]));
    if ([...numbersIn(text)].some((n) => !found.has(n))) return { text, cite, reason: 'number not in passage' };
    return { text, cite };
  });
}

/** Final verdict per claim: a precheck failure means no support; otherwise the model's score (missing = 0). */
export function decide(pre: Prechecked[], scores: Map<number, number>, supportMin: number): KeptClaim[] {
  return pre.map((c, i) => {
    const support = c.reason ? 0 : Math.min(1, Math.max(0, scores.get(i) ?? 0));
    const kept = support >= supportMin;
    const reason = c.reason ?? (kept ? undefined : 'below threshold');
    return { text: c.text, cite: c.cite, support, kept, ...(reason ? { reason } : {}) };
  });
}
