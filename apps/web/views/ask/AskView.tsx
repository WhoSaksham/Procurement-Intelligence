'use client';

import { ChevronDownIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { AgentTrace } from '@/components/AgentTrace';
import { Cite } from '@/components/evidence/Cite';
import { PageHead } from '@/components/page-head';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import * as client from '@/lib/api/client';
import { useQuestions } from '@/lib/api/queries';
import { cssPct } from '@/lib/format';
import { cn } from '@/lib/utils';

/** A question and when it was asked (asking the same question again replays the trace). */
type Asked = { q: string; at: number };

function Suggestions({ onAsk }: { onAsk: (q: string) => void }) {
  const questions = useQuestions().data?.questions ?? [];
  return (
    <div className="flex flex-wrap gap-2">
      {questions.map((q) => (
        <Button key={q} variant="outline" size="sm" className="h-auto max-w-full shrink bg-surface py-1.5 text-left whitespace-normal" onClick={() => onAsk(q)}>
          {q}
        </Button>
      ))}
    </div>
  );
}

const evaluate = (q: string, at: number): Asked => ({ q, at });

/** Answers only from indexed passages; every sentence is checked against its source. */
export function AskView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = params.get('q') ?? '';
  // A question in the URL (from the command menu or a shared link) runs immediately.
  const [input, setInput] = useState(fromUrl);
  const [asked, setAsked] = useState<Asked | null>(() => (fromUrl.trim() ? evaluate(fromUrl, 0) : null));
  const [running, setRunning] = useState(() => !!asked);
  const [seen, setSeen] = useState(fromUrl);
  // A new question arriving in the URL while this view is open (command menu).
  if (fromUrl !== seen) {
    setSeen(fromUrl);
    if (fromUrl.trim() && fromUrl !== asked?.q) {
      const next = evaluate(fromUrl, (asked?.at ?? 0) + 1);
      setInput(fromUrl);
      setAsked(next);
      setRunning(true);
    }
  }

  const ask = (q: string) => {
    if (!q.trim()) return;
    setInput(q);
    const next = evaluate(q, (asked?.at ?? 0) + 1);
    setAsked(next);
    setRunning(true);
    router.replace(`${pathname}?q=${encodeURIComponent(q)}`, { scroll: false });
  };

  // The API refuses instruction-like questions, matches a prepared answer and marks each claim kept or removed.
  const result = useQuery({ queryKey: ['ask', asked?.q], queryFn: () => client.ask(asked!.q), enabled: !!asked, staleTime: Infinity, retry: false });
  const r = result.data;
  const blocked = r?.blocked === true;
  const answered = r && r.blocked === false ? r : null;
  const a = answered?.answer ?? null;
  const supportMin = answered?.supportMin ?? 0.75;
  const kept = a?.claims.filter((c) => c.kept) ?? [];
  const dropped = a?.claims.filter((c) => !c.kept) ?? [];

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
          <Button type="submit" className="h-10" disabled={(running && !blocked) || !input.trim()}>
            Ask
          </Button>
        </div>
        {!asked && <Suggestions onAsk={ask} />}
      </form>

      {asked && (
        <Card data-testid="answer-panel">
          <CardContent className="grid gap-4">
            {result.isError ? (
              <p className="text-ink-2" role="alert">
                <strong className="text-ink">Couldn&apos;t ask right now.</strong> {result.error instanceof Error ? result.error.message : 'Try again.'}
              </p>
            ) : !r ? (
              <Skeleton className="h-24 w-full" aria-label="Searching" />
            ) : blocked ? (
              <p className="text-ink-2">
                <strong className="text-ink">Not answered.</strong> The question contains instructions to the assistant, so nothing was searched or generated. Ask about a project,
                method or risk instead.
              </p>
            ) : running ? (
              <AgentTrace key={asked.q + asked.at} steps={answered?.steps ?? []} running stepMs={200} onDone={() => setRunning(false)} />
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
                        const ok = c.kept;
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
                      Support is the probability that the cited passage states the claim; threshold {supportMin}. Numbers must also match the passage exactly. Removed sentences
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
            {(!running || blocked || result.isError) && (
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
