'use client';

import { ChevronDownIcon } from 'lucide-react';
import { AgentTrace } from '@/components/AgentTrace';
import { Cite } from '@/components/evidence/Cite';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import type { AskTurn as Turn, KeptClaim } from '@/lib/api/types';
import { cssPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PackageCite } from './PackageCite';

const WHY: Record<NonNullable<KeptClaim['reason']>, string> = {
  'no valid citation': 'It cites no passage the model was given.',
  'number not in passage': 'A number in it does not appear in the cited passage.',
  'below threshold': 'No passage supports this.',
};

function Cites({ ids, pkg }: { ids: string[]; pkg?: Turn['pkg'] }) {
  return (
    <>
      <Cite ids={ids.filter((id) => id !== 'pkg')} />
      {pkg && ids.includes('pkg') && <PackageCite pkg={pkg} />}
    </>
  );
}

export type TurnState =
  | { status: 'pending' }
  | { status: 'error'; message: string }
  | { status: 'blocked' }
  | { status: 'answered'; turn: Turn; supportMin: number; animate: boolean };

/** One question and its answer in the conversation. */
export function AskTurn({ q, state, onAnimated, noAnswer }: { q: string; state: TurnState; onAnimated: () => void; noAnswer: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <p className="text-sm font-semibold text-ink" data-testid="asked">
        {q}
      </p>
      <Card data-testid="answer-panel">
        <CardContent className="grid gap-4">
          {state.status === 'error' ? (
            <p className="text-ink-2" role="alert">
              <strong className="text-ink">Couldn&apos;t ask right now.</strong> {state.message}
            </p>
          ) : state.status === 'pending' ? (
            <Skeleton className="h-24 w-full" aria-label="Searching" />
          ) : state.status === 'blocked' ? (
            <p className="text-ink-2">
              <strong className="text-ink">Not answered.</strong> The question contains instructions to the assistant, so nothing was searched or generated. Ask about a project,
              method or risk instead.
            </p>
          ) : state.animate ? (
            <AgentTrace steps={state.turn.steps} running stepMs={200} onDone={onAnimated} />
          ) : (
            <Answered turn={state.turn} supportMin={state.supportMin} noAnswer={noAnswer} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function Answered({ turn, supportMin, noAnswer }: { turn: Turn; supportMin: number; noAnswer: React.ReactNode }) {
  const kept = turn.claims.filter((c) => c.kept);
  const dropped = turn.claims.filter((c) => !c.kept);
  return (
    <>
      {turn.outOfScope ? (
        <p className="text-ink-2">
          <strong className="text-ink">Not answered.</strong> Ask about procurement, the projects or your package.
        </p>
      ) : kept.length ? (
        <div className="grid max-w-[75ch] gap-3 font-serif text-[16px] leading-relaxed text-ink" data-testid="answer">
          {kept.map((c) => (
            <p key={c.text}>
              {c.text}
              <Cites ids={c.cite} pkg={turn.pkg} />
            </p>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-ink-2">
            <strong className="text-ink">No grounded answer.</strong> Nothing in the index supports an answer above the relevance threshold, so none is given.
          </p>
          {noAnswer}
        </div>
      )}
      {turn.claims.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium text-procedure hover:underline">
            {kept.length} of {turn.claims.length} sentences verified{dropped.length ? `, ${dropped.length} removed` : ''}
            <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <ul className="grid gap-2" data-testid="grounding">
              {turn.claims.map((c) => (
                <li key={c.text} className="grid grid-cols-[5.5rem_4.5rem_minmax(0,1fr)] items-start gap-3 text-sm max-md:grid-cols-[5.5rem_minmax(0,1fr)]">
                  <span className="flex items-center gap-1.5 text-xs text-muted-ink">
                    <span className="h-1.5 w-10 rounded-full bg-sunk">
                      <span className={cn('block h-full rounded-full', c.kept ? 'bg-good' : 'bg-worse')} style={{ width: cssPct(c.support * 100) }} />
                    </span>
                    {c.support.toFixed(2)}
                  </span>
                  <span className={cn('font-semibold', c.kept ? 'text-good' : 'text-worse')}>{c.kept ? 'Kept' : 'Removed'}</span>
                  <span className={cn('text-ink-2 max-md:col-span-2', !c.kept && 'line-through decoration-worse/60')}>
                    {c.text}
                    {c.kept ? (
                      <Cites ids={c.cite} pkg={turn.pkg} />
                    ) : (
                      <span className="text-muted-ink no-underline">
                        {' '}
                        {WHY[c.reason ?? 'below threshold']} ({c.reason ?? 'below threshold'})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="fine">
              Support is the probability that the cited passage states the claim; threshold {supportMin}. Numbers must also match the passage exactly. Removed sentences are
              logged for review.
            </p>
          </CollapsibleContent>
        </Collapsible>
      )}
      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium text-procedure hover:underline">
          How this was answered
          <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <AgentTrace steps={turn.steps} />
        </CollapsibleContent>
      </Collapsible>
      {turn.notice ? (
        <p className="fine" data-testid="ask-notice">
          {turn.notice}
        </p>
      ) : turn.model ? (
        <p className="fine">Answered by {turn.model}.</p>
      ) : null}
    </>
  );
}
