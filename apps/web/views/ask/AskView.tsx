'use client';

import { ChevronDownIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AgentTrace } from '@/components/AgentTrace';
import { Cite } from '@/components/evidence/Cite';
import { PageHead } from '@/components/page-head';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ANSWERS, INJECTION, match, STEPS, SUPPORT_MIN, type Answer } from './data';
import { cssPct } from '@/lib/format';

type Asked = { q: string; at: number } & ({ blocked: true } | { blocked?: false; answer: Answer | null });

function Suggestions({ onAsk }: { onAsk: (q: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ANSWERS.map((x) => (
        <Button key={x.q} variant="outline" size="sm" className="h-auto max-w-full shrink bg-surface py-1.5 text-left whitespace-normal" onClick={() => onAsk(x.q)}>
          {x.q}
        </Button>
      ))}
    </div>
  );
}

const evaluate = (q: string, at: number): Asked => (INJECTION.test(q) ? { q, at, blocked: true } : { q, at, answer: match(q) });

/** Answers only from indexed passages; every sentence is checked against its source. */
export function AskView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = params.get('q') ?? '';
  // A question in the URL (from the command menu or a shared link) runs immediately.
  const [input, setInput] = useState(fromUrl);
  const [asked, setAsked] = useState<Asked | null>(() => (fromUrl.trim() ? evaluate(fromUrl, 0) : null));
  const [running, setRunning] = useState(() => !!asked && !asked.blocked);
  const [seen, setSeen] = useState(fromUrl);
  // A new question arriving in the URL while this view is open (command menu).
  if (fromUrl !== seen) {
    setSeen(fromUrl);
    if (fromUrl.trim() && fromUrl !== asked?.q) {
      const next = evaluate(fromUrl, (asked?.at ?? 0) + 1);
      setInput(fromUrl);
      setAsked(next);
      setRunning(!next.blocked);
    }
  }

  const ask = (q: string) => {
    if (!q.trim()) return;
    setInput(q);
    const next = evaluate(q, (asked?.at ?? 0) + 1);
    setAsked(next);
    setRunning(!next.blocked);
    router.replace(`${pathname}?q=${encodeURIComponent(q)}`, { scroll: false });
  };

  const a = asked && !asked.blocked ? asked.answer : null;
  const kept = a?.claims.filter((c) => c.support >= SUPPORT_MIN) ?? [];
  const dropped = a?.claims.filter((c) => c.support < SUPPORT_MIN) ?? [];

  return (
    <>
      <PageHead title="Ask the evidence" lede="Answers come only from indexed records and documents, and every sentence is checked against its source." />
      <form
        className="mb-4 grid gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <div className="flex max-w-3xl gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about a project, method or risk" aria-label="Your question" className="h-10 bg-surface" />
          <Button type="submit" className="h-10" disabled={running || !input.trim()}>
            Ask
          </Button>
        </div>
        {!asked && <Suggestions onAsk={ask} />}
      </form>

      {asked && (
        <Card data-testid="answer-panel">
          <CardContent className="grid gap-4">
            {asked.blocked ? (
              <p className="text-ink-2">
                <strong className="text-ink">Not answered.</strong> The question contains instructions to the assistant, so nothing was searched or generated. Ask about a project,
                method or risk instead.
              </p>
            ) : running ? (
              <AgentTrace key={asked.q + asked.at} steps={STEPS(a?.claims.length ?? 0)} running stepMs={200} onDone={() => setRunning(false)} />
            ) : a ? (
              <>
                <div className="grid max-w-[75ch] gap-3 font-serif text-[16px] leading-relaxed text-ink" data-testid="answer">
                  {kept.map((c) => (
                    <p key={c.text}>
                      {c.text}
                      <Cite ids={c.cite} />
                    </p>
                  ))}
                </div>
                <Collapsible>
                  <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium text-procedure hover:underline">
                    {kept.length} of {a.claims.length} sentences verified{dropped.length ? `, ${dropped.length} removed` : ''}
                    <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3">
                    <ul className="grid gap-2" data-testid="grounding">
                      {a.claims.map((c) => {
                        const ok = c.support >= SUPPORT_MIN;
                        return (
                          <li key={c.text} className="grid grid-cols-[5.5rem_4.5rem_minmax(0,1fr)] items-start gap-3 text-sm max-md:grid-cols-[5.5rem_minmax(0,1fr)]">
                            <span className="flex items-center gap-1.5 text-xs text-muted-ink">
                              <span className="h-1.5 w-10 rounded-full bg-sunk">
                                <span className={cn('block h-full rounded-full', ok ? 'bg-good' : 'bg-worse')} style={{ width: cssPct(c.support * 100) }} />
                              </span>
                              {c.support.toFixed(2)}
                            </span>
                            <span className={cn('font-semibold', ok ? 'text-good' : 'text-worse')}>{ok ? 'Kept' : 'Removed'}</span>
                            <span className={cn('text-ink-2 max-md:col-span-2', !ok && 'line-through decoration-worse/60')}>
                              {c.text}
                              {ok ? <Cite ids={c.cite} /> : <span className="text-muted-ink no-underline"> No passage supports this.</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="fine">
                      Support is the probability that the cited passage states the claim; threshold {SUPPORT_MIN}. Numbers must also match the passage exactly. Removed sentences
                      are logged for review.
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              </>
            ) : (
              <div className="grid gap-3">
                <p className="text-ink-2">
                  <strong className="text-ink">No grounded answer.</strong> Nothing in the index supports an answer above the relevance threshold, so none is given.
                </p>
                <p className="text-sm text-muted-ink">Name a project, method or risk, or try one of these:</p>
                <Suggestions onAsk={ask} />
              </div>
            )}
            {!running && (
              <button
                type="button"
                className="w-fit text-sm font-medium text-procedure hover:underline"
                onClick={() => {
                  setAsked(null);
                  setInput('');
                  router.replace(pathname, { scroll: false });
                }}
              >
                Ask something else
              </button>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
