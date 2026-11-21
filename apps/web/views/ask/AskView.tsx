'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { PageHead } from '@/components/page-head';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import * as client from '@/lib/api/client';
import { usePackage } from '@/lib/api/package';
import { qk, useQuestions } from '@/lib/api/queries';
import type { AskThread } from '@/lib/api/types';
import { AskTurn, type TurnState } from './AskTurn';

/** A question asked in this page session, with what was sent alongside it. */
type Entry = { key: number; q: string; threadId: string | null; packageId: string | null };

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

const message = (e: unknown) => (e instanceof Error ? e.message : 'Try again.');

/**
 * A conversation with the evidence. Each answer is drafted only from retrieved passages
 * (and the open package), and every sentence is checked against what it cites.
 * `?t=` restores a conversation; `?q=` (command menu, shared links) starts one.
 */
export function AskView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const urlT = params.get('t');
  const { id: packageId, pkg } = usePackage();

  const [input, setInput] = useState(urlQ);
  const [base, setBase] = useState<AskThread | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [animated, setAnimated] = useState<number[]>([]);
  const [withPackage, setWithPackage] = useState(true);
  const [seenQ, setSeenQ] = useState<string | null>(null);
  // A conversation the analyst left with "New conversation": never restore it from a lagging URL.
  const [dismissed, setDismissed] = useState<string | null>(null);

  // POST /v1/ask once per entry; cached by entry key so re-renders never ask again.
  const results = useQueries({
    queries: entries.map((e) => ({
      queryKey: ['ask', e.key],
      queryFn: () => client.ask(e.q, { ...(e.threadId ? { threadId: e.threadId } : {}), ...(e.packageId ? { packageId: e.packageId } : {}) }),
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
    })),
  });

  // The conversation continues on the thread of the latest answer (or the restored one).
  let threadId: string | null = base?.id ?? null;
  for (const r of results) if (r.data?.threadId) threadId = r.data.threadId;

  // Restore a conversation from the URL (reload, shared link, back button).
  const wantRestore = urlT && urlT !== threadId && urlT !== dismissed && !entries.length ? urlT : null;
  const restore = useQuery({ queryKey: qk.askThread(wantRestore ?? ''), queryFn: () => client.getThread(wantRestore!), enabled: !!wantRestore, retry: false });
  if (wantRestore && restore.data?.id === wantRestore && base?.id !== wantRestore) setBase(restore.data);

  const start = (q: string, fresh: boolean) => {
    const entry: Entry = { key: nextKey, q, threadId: fresh ? null : threadId, packageId: withPackage ? packageId : null };
    setNextKey(nextKey + 1);
    if (fresh) setBase(null);
    setEntries(fresh ? [entry] : [...entries, entry]);
    setInput('');
  };

  // A question arriving in the URL (command menu) starts a new conversation once the open package is known.
  if (urlQ !== seenQ && packageId !== null) {
    setSeenQ(urlQ);
    if (urlQ.trim()) start(urlQ, true);
  }

  // Keep the address pointing at the conversation, so reload and sharing work.
  useEffect(() => {
    if (threadId && params.get('t') !== threadId) router.replace(`${pathname}?t=${threadId}`, { scroll: false });
  }, [threadId, params, pathname, router]);

  // Busy while an answer is coming or animating, and while a conversation is loading (a question
  // asked then would start a new thread and drop the one on its way).
  const restoring = !!wantRestore && restore.isPending;
  const busy = restoring || results.some((r, i) => r.isPending || (r.data?.blocked === false && !animated.includes(entries[i].key)));
  const hasTurns = !!base?.turns.length || entries.length > 0;
  const supportMin = useQuestions().data?.supportMin ?? 0.75;

  const ask = (q: string) => {
    if (!q.trim() || busy) return;
    start(q.trim(), false);
  };

  const reset = () => {
    setDismissed(threadId ?? urlT);
    setBase(null);
    setEntries([]);
    setWithPackage(true);
    setInput('');
    router.replace(pathname, { scroll: false });
  };

  const noAnswer = (
    <>
      <p className="text-sm text-muted-ink">Name a project, method or risk, or try one of these:</p>
      <Suggestions onAsk={ask} />
    </>
  );

  return (
    <>
      <PageHead
        title="Ask the evidence"
        lede="Answers come only from indexed records and documents (and your package), and every sentence is checked against its source. Ask follow-ups to keep going."
      />

      {hasTurns && (
        <div className="mb-6 grid max-w-4xl gap-6">
          {base?.turns.map((t, i) => (
            <AskTurn key={`base-${i}`} q={t.q} state={{ status: 'answered', turn: t, supportMin, animate: false }} onAnimated={() => {}} noAnswer={noAnswer} />
          ))}
          {entries.map((e, i) => {
            const r = results[i];
            const state: TurnState = r.isError
              ? { status: 'error', message: message(r.error) }
              : !r.data
                ? { status: 'pending' }
                : r.data.blocked
                  ? { status: 'blocked' }
                  : { status: 'answered', turn: r.data.turn, supportMin: r.data.supportMin, animate: !animated.includes(e.key) };
            return <AskTurn key={e.key} q={e.q} state={state} onAnimated={() => setAnimated((a) => [...a, e.key])} noAnswer={noAnswer} />;
          })}
        </div>
      )}
      {wantRestore && restore.isError && (
        <p className="mb-4 text-ink-2" role="alert">
          <strong className="text-ink">That conversation is no longer available.</strong> Conversations are kept for 30 days after the last question.
        </p>
      )}

      <form
        className="mb-4 grid max-w-3xl gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={hasTurns ? 'Ask a follow-up' : 'Ask about a project, method or risk'}
            aria-label="Your question"
            className="h-10 bg-surface"
          />
          <Button type="submit" className="h-10" disabled={busy || !input.trim()}>
            Ask
          </Button>
        </div>
        {pkg && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2" data-testid="ask-package">
            {withPackage ? (
              <>
                <span>
                  Using: <strong className="font-medium text-ink">{pkg.name}</strong>
                </span>
                <button type="button" className="font-medium text-procedure hover:underline" onClick={() => setWithPackage(false)}>
                  Don&apos;t use it
                </button>
              </>
            ) : (
              <>
                <span>Not using your package.</span>
                <button type="button" className="font-medium text-procedure hover:underline" onClick={() => setWithPackage(true)}>
                  Use it
                </button>
              </>
            )}
          </p>
        )}
        {!hasTurns && <Suggestions onAsk={ask} />}
      </form>
      {hasTurns && !busy && (
        <button type="button" className="w-fit text-sm font-medium text-procedure hover:underline" onClick={reset}>
          New conversation
        </button>
      )}
    </>
  );
}
