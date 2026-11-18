'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ServerCrash } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useBackend } from '@/lib/api/backend';
import * as client from '@/lib/api/client';
import { isUnreachable } from '@/lib/api/client';
import { usePackage } from '@/lib/api/package';
import { qk, useReference } from '@/lib/api/queries';

const POLL_MS = 5_000;

/**
 * Shows "Backend unreachable" in place of the view whenever a request finds
 * the API down (at load or mid-session), and recovers on its own: it polls,
 * and when the API answers it refetches what failed and sends edits kept
 * meanwhile. The rail, command menu and theme stay usable.
 */
export function BackendGate({ children }: { children: ReactNode }) {
  const reference = useReference();
  const flagged = useBackend((s) => s.down);
  const setDown = useBackend((s) => s.setDown);
  const { flush } = usePackage();
  const qc = useQueryClient();
  const down = flagged || (reference.isError && isUnreachable(reference.error));

  useEffect(() => {
    if (!down) return;
    let stopped = false;
    const probe = async () => {
      try {
        qc.setQueryData(qk.reference, await client.getReference());
      } catch {
        return;
      }
      if (stopped) return;
      setDown(false);
      void qc.refetchQueries({ type: 'active', predicate: (q) => q.state.status === 'error' });
      void flush();
    };
    const t = setInterval(() => void probe(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [down, qc, setDown, flush]);

  if (!down) return <>{children}</>;
  return (
    <div role="alert" className="mx-auto mt-16 grid max-w-md justify-items-center gap-3 text-center">
      <ServerCrash className="size-8 text-muted-ink" aria-hidden />
      <h1 className="text-2xl font-semibold">Backend unreachable</h1>
      <p className="text-ink-2">The procurement API isn&apos;t answering. Your unsaved edits are kept and will be saved when it reconnects. This page reconnects on its own.</p>
      <Button
        onClick={() => {
          setDown(false);
          void qc.refetchQueries({ type: 'active' });
          void flush();
        }}
      >
        Retry now
      </Button>
    </div>
  );
}
