'use client';

import { CheckIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface Step {
  name: string;
  tool: string;
  detail: string;
}

/**
 * The retrieval agent's steps, each with what it queried and what it returned,
 * so a reviewer can audit the path to an answer. When `running`, steps reveal
 * one by one (instantly with reduced motion); remount with a new key to replay.
 */
export function AgentTrace({ steps, running = false, onDone, stepMs = 520 }: { steps: Step[]; running?: boolean; onDone?: () => void; stepMs?: number }) {
  const [shown, setShown] = useState(running ? 0 : steps.length);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (!running) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let i = 0;
    const t = setInterval(
      () => {
        i = reduce ? steps.length : i + 1;
        setShown(i);
        if (i >= steps.length) {
          clearInterval(t);
          setTimeout(() => done.current?.(), 250);
        }
      },
      reduce ? 0 : stepMs,
    );
    return () => clearInterval(t);
  }, [running, steps.length, stepMs]);

  return (
    <ol className="grid gap-2" aria-live="polite" data-testid="agent-trace">
      {steps.map((s, i) => {
        const state = i < shown ? 'done' : i === shown && running ? 'active' : 'pending';
        return (
          <li key={s.name} className={cn('grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2.5 text-sm', state === 'pending' && 'opacity-50')}>
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 grid size-5 place-items-center rounded-full border',
                state === 'done' && 'border-good bg-good text-surface',
                state === 'active' && 'animate-pulse border-procedure',
                state === 'pending' && 'border-rule-strong',
              )}
            >
              {state === 'done' && <CheckIcon className="size-3" />}
            </span>
            <div>
              <p className="font-medium text-ink">
                {s.name}
                <span className="ml-2 rounded bg-sunk px-1.5 py-0.5 font-mono text-[11px] text-muted-ink">{s.tool}</span>
              </p>
              {state === 'done' && <p className="text-ink-2">{s.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
