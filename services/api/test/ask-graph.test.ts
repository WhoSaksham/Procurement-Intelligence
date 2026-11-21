import { describe, expect, it, vi } from 'vitest';
import type { Answer, Source } from '../src/modules/analysis/types.js';
import { runAsk, type RunInput } from '../src/modules/ask/graph.js';
import { ModelError, type AskModel, type ClaimToVerify } from '../src/modules/ask/model-port.js';
import { sourcePassage, type Passage } from '../src/modules/ask/retrieve.js';
import { readSeed } from './seed-dir.js';

const sources = Object.entries(readSeed<Record<string, Source>>('sources.json')).map(([id, s]) => sourcePassage({ id, ...s }));
const answers = readSeed<{ answers: Answer[] }>('answers.json').answers;
const ca1 = sources.find((s) => s.id === 'ca1')!;
const quote = '27.6% of packages recorded at least one re-tender or cancellation before award.';
const pkg: Passage = { id: 'pkg', title: 'Your package: W-07', text: 'Name: "W-07". Planned days: 210.' };

/** A model that answers from ca1: one supported claim and one unsupported. */
function scripted(over: Partial<AskModel> = {}): AskModel {
  return {
    name: 'scripted',
    contextualise: vi.fn(async ({ q }: { q: string }) => ({ standalone: `standalone: ${q}`, inScope: true })),
    draft: vi.fn(async () => ({
      outOfScope: false,
      claims: [
        { text: quote, cite: ['ca1'] },
        { text: 'Bidder collusion causes most re-tenders.', cite: ['ca1'] },
      ],
    })),
    verify: vi.fn(async ({ claims }: { claims: ClaimToVerify[] }) => ({ scores: claims.map((c) => ({ i: c.i, support: c.text === quote ? 0.97 : 0.3 })) })),
    ...over,
  };
}

const input = (over: Partial<RunInput> = {}): RunInput => ({
  q: 'Why do packages get re-tendered?',
  history: [],
  pkg: null,
  sources,
  answers,
  supportMin: 0.75,
  model: scripted(),
  ...over,
});

describe('runAsk', () => {
  it('answers with kept and removed claims and four real steps', async () => {
    const model = scripted();
    const r = await runAsk(input({ model }));
    expect(r.mode).toBe('llm');
    expect(r.model).toBe('scripted');
    expect(r.notice).toBeUndefined();
    expect(r.steps.map((s) => s.name)).toEqual(['Find passages', 'Draft from passages', 'Check citations and numbers', 'Score support']);
    expect(r.claims).toEqual([
      { text: quote, cite: ['ca1'], support: 0.97, kept: true },
      { text: 'Bidder collusion causes most re-tenders.', cite: ['ca1'], support: 0.3, kept: false, reason: 'below threshold' },
    ]);
    expect(model.contextualise).not.toHaveBeenCalled();
    expect(r.standalone).toBe('Why do packages get re-tendered?');
  });

  it('follow-up runs the rewrite first', async () => {
    const model = scripted();
    const r = await runAsk(input({ model, history: [{ q: 'Why delays?', kept: ['Because.'] }], q: 'and re-tenders?' }));
    expect(r.steps[0].name).toBe('Rewrite follow-up');
    expect(r.standalone).toBe('standalone: and re-tenders?');
    expect(vi.mocked(model.draft).mock.calls[0][0].q).toBe('standalone: and re-tenders?');
  });

  it('out of scope stops before drafting', async () => {
    const model = scripted({ contextualise: vi.fn(async () => ({ standalone: 'cake', inScope: false })) });
    const r = await runAsk(input({ model, history: [{ q: 'x', kept: [] }], q: 'and a cake recipe?' }));
    expect(r.outOfScope).toBe(true);
    expect(r.claims).toEqual([]);
    expect(model.draft).not.toHaveBeenCalled();
  });

  it('first-turn scope check comes from draft', async () => {
    const model = scripted({ draft: vi.fn(async () => ({ outOfScope: true, claims: [] })) });
    const r = await runAsk(input({ model, q: 'What is the capital of France?' }));
    expect(r.outOfScope).toBe(true);
    expect(model.verify).not.toHaveBeenCalled();
  });

  it('a citation the model was not given never survives', async () => {
    const model = scripted({ draft: vi.fn(async () => ({ outOfScope: false, claims: [{ text: quote, cite: ['made-up'] }] })) });
    const r = await runAsk(input({ model }));
    expect(r.claims[0]).toMatchObject({ kept: false, support: 0, reason: 'no valid citation' });
    expect(model.verify).not.toHaveBeenCalled();
  });

  it('quota error falls back to prepared', async () => {
    const model = scripted({ draft: vi.fn(async () => Promise.reject(new ModelError('quota'))) });
    const r = await runAsk(input({ model }));
    expect(r.mode).toBe('prepared');
    expect(r.failure).toBe('quota');
    expect(r.notice).toBe('Live model unavailable — showing a prepared answer.');
    expect(r.claims.some((c) => c.text.includes('27.6%'))).toBe(true);
    expect(r.steps.at(-1)?.name).toBe('Check each claim against its passage');
  });

  it('keeps the model error message for the logs', async () => {
    const model = scripted({ draft: vi.fn(async () => Promise.reject(new ModelError('upstream', new Error('[503 Service Unavailable] overloaded')))) });
    const r = await runAsk(input({ model }));
    expect(r.failureDetail).toContain('503 Service Unavailable');
  });

  it('fallback matches on previous question + follow-up', async () => {
    const model = scripted({ contextualise: vi.fn(async () => Promise.reject(new ModelError('upstream'))) });
    const r = await runAsk(
      input({ model, history: [{ q: 'What caused the delays on the Rural Access and Connectivity Project?', kept: [] }], q: 'and the cause?' }),
    );
    expect(r.mode).toBe('prepared');
    const delay = answers.find((a) => a.q.startsWith('What caused the delays'))!;
    expect(r.claims.map((c) => c.text)).toEqual(delay.claims.map((c) => c.text));
  });

  it('fallback uses the rewritten question when there is one', async () => {
    const model = scripted({
      contextualise: vi.fn(async () => ({ standalone: 'How long does a QCBS consulting selection take?', inScope: true })),
      draft: vi.fn(async () => Promise.reject(new ModelError('invalid'))),
    });
    const r = await runAsk(input({ model, history: [{ q: 'Why delays?', kept: [] }], q: 'and for consultants?' }));
    expect(r.claims[0].text).toMatch(/QCBS|selection/i);
  });

  it('overrunning the budget falls back', async () => {
    const hang = (_i: unknown, signal: AbortSignal) =>
      new Promise<never>((_r, reject) => signal.addEventListener('abort', () => reject(new ModelError('timeout')), { once: true }));
    const model = scripted({ draft: vi.fn(hang) });
    const t = Date.now();
    const r = await runAsk(input({ model, budgetMs: 50 }));
    expect(Date.now() - t).toBeLessThan(1000);
    expect(r).toMatchObject({ mode: 'prepared', failure: 'timeout' });
  });

  it('no model means prepared with the not-configured notice', async () => {
    const r = await runAsk(input({ model: null }));
    expect(r).toMatchObject({ mode: 'prepared', notice: 'Live model not configured — showing a prepared answer.' });
    expect(r.failure).toBeUndefined();
  });

  it('a limit means prepared with the unavailable notice and no model call', async () => {
    const model = scripted();
    const r = await runAsk(input({ model, unavailable: 'limit' }));
    expect(r.mode).toBe('prepared');
    expect(r.notice).toBe('Live model unavailable — showing a prepared answer.');
    expect(model.draft).not.toHaveBeenCalled();
  });

  it('pkg passage is offered to the model', async () => {
    const model = scripted();
    await runAsk(input({ model, pkg }));
    expect(vi.mocked(model.draft).mock.calls[0][0].passages.map((p) => p.id)).toContain('pkg');
  });

  it('no passages and no package means no answer without calling the model', async () => {
    const model = scripted();
    const r = await runAsk(input({ model, q: 'zzzz qqqq' }));
    expect(r).toMatchObject({ mode: 'llm', claims: [] });
    expect(model.draft).not.toHaveBeenCalled();
  });

  it('verify is shown only the passages each claim cites', async () => {
    const model = scripted();
    await runAsk(input({ model, pkg }));
    const claims = vi.mocked(model.verify).mock.calls[0][0].claims;
    expect(claims[0].passages).toEqual([ca1]);
  });
});
