import type { AskModel } from './model-port.js';
import type { Passage } from './retrieve.js';

// A deterministic stand-in for the LLM, for end-to-end tests of the live-model UI.
// Reachable only when the API runs with E2E=1 and the request carries x-ask-model: fake.

const OFF_TOPIC = /\b(recipe|weather|poem|joke)\b/i;
export const INVENTED = 'Every package in the cohort finished early.';

/** The longest sentence of a passage, so the claim is stated verbatim and its numbers match. */
const sentence = (p: Passage) =>
  p.text
    .split(/(?<=\.)\s+/)
    .filter((s) => s.length <= 300)
    .sort((a, b) => b.length - a.length)[0] ?? p.title;

export function fakeModel(): AskModel {
  return {
    name: 'fake',
    async contextualise({ history, q }) {
      const prev = history.at(-1)?.q;
      return { standalone: prev ? `${prev} — ${q}` : q, inScope: !OFF_TOPIC.test(q) };
    },
    async draft({ q, passages }) {
      if (OFF_TOPIC.test(q)) return { outOfScope: true, claims: [] };
      // The best passage, plus the package when it was given (so package citations are always exercised).
      const pkg = passages.find((p) => p.id === 'pkg');
      const rest = passages.filter((p) => p.id !== 'pkg');
      const top = pkg ? [...rest.slice(0, 1), pkg] : rest.slice(0, 2);
      if (!top.length) return { outOfScope: false, claims: [] };
      return {
        outOfScope: false,
        claims: [...top.map((p) => ({ text: sentence(p), cite: [p.id] })), { text: INVENTED, cite: [top[0].id] }],
      };
    },
    async verify({ claims }) {
      return { scores: claims.map((c) => ({ i: c.i, support: c.passages.some((p) => p.text.includes(c.text)) ? 0.95 : 0.2 })) };
    },
  };
}
