import type { Source } from '../analysis/types.js';

/** Text the model may read and cite, by id. */
export interface Passage {
  id: string;
  title: string;
  text: string;
}

export const sourcePassage = (s: Source & { id: string }): Passage => ({
  id: s.id,
  title: `${s.kind}: ${s.title}`,
  text: [`Project: ${s.project}. Date: ${s.date}. ${s.locator}.`, s.before, s.quote, s.after].filter(Boolean).join(' '),
});

/** Words that mean the same thing in procurement questions; a query word pulls in its whole group. */
const SYNONYMS: string[][] = [
  ['re-tender', 'retender', 'rebid', 're-bid', 'cancel', 'cancellation', 'cancelled'],
  ['delay', 'delays', 'slip', 'slippage', 'late', 'overrun'],
  ['e&s', 'esf', 'eshs', 'environmental', 'social', 'safeguard', 'safeguards'],
  ['qcbs', 'consultant', 'consultants', 'consulting', 'selection', 'reoi'],
  ['progress', 'satellite', 'sentinel', 'site'],
];

const tokens = (text: string): string[] =>
  (text.toLowerCase().match(/[a-z0-9&]+(?:-[a-z0-9&]+)*/g) ?? []).flatMap((t) => (t.includes('-') ? [t, ...t.split('-')] : [t]));

function expand(query: string): string[] {
  const out = new Set(tokens(query));
  for (const group of SYNONYMS) if (group.some((w) => out.has(w))) for (const w of group) for (const t of tokens(w)) out.add(t);
  return [...out];
}

const K1 = 1.2;
const B = 0.75;

/** BM25 over title and text; the top `k` passages that share at least one word with the query. */
export function retrieve(query: string, passages: Passage[], k = 8): { passage: Passage; score: number }[] {
  const docs = passages.map((p) => tokens(`${p.title} ${p.text}`));
  const avg = docs.reduce((n, d) => n + d.length, 0) / Math.max(docs.length, 1);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const q = expand(query);
  const n = docs.length;
  return passages
    .map((passage, i) => {
      const d = docs[i];
      const tf = new Map<string, number>();
      for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0;
      for (const t of q) {
        const f = tf.get(t);
        if (!f) continue;
        const idf = Math.log(1 + (n - df.get(t)! + 0.5) / (df.get(t)! + 0.5));
        score += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.length) / avg));
      }
      return { passage, score, i };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, k)
    .map(({ passage, score }) => ({ passage, score }));
}
