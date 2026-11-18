'use client';

import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import * as client from './client';
import { ApiError, isUnreachable } from './client';
import { reportFailure } from './backend';
import { EXAMPLE_ID, initialPackageId, useCurrentPackage } from './current-package';
import { importLegacyScenario } from './legacy-import';
import { qk } from './queries';
import type { Analysis, Criteria, Package, PackageSummary, PackageView } from './types';
import { createWriteQueue, type Change, type WriteQueue } from './write-queue';

interface PackageContext {
  /** Current package id; null until the browser has decided which one to open. */
  id: string | null;
  setId: (id: string) => void;
  /** Last saved state from the server. */
  view: PackageView | undefined;
  /** What the analyst sees: the saved package with unsent edits on top. */
  pkg: Package | undefined;
  criteria: Criteria | undefined;
  /** Always the last server answer; never blanked while a save is in flight. */
  analysis: Analysis | undefined;
  /** Edits waiting or a save in flight. */
  updating: boolean;
  /** Change package fields or criteria; shown immediately, saved in the background. */
  edit: (change: Change) => void;
  /** Send pending edits now (e.g. on pointer-up after a drag). */
  flush: () => Promise<void>;
  /**
   * Run any other change (sign-off, benchmark, contracts, countries, reset).
   * Pending edits are saved first; the example is copied first if needed.
   */
  mutate: (fn: (id: string, version: number) => Promise<PackageView>) => Promise<PackageView | null>;
}

const Ctx = createContext<PackageContext | null>(null);

/** Keep the switcher's list in step with a saved package without refetching it. */
const summarise = (qc: QueryClient, v: PackageView) =>
  qc.setQueryData<{ items: PackageSummary[] }>(qk.packages, (old) =>
    old && old.items.some((i) => i.id === v.id)
      ? { items: old.items.map((i) => (i.id === v.id ? { ...i, name: v.pkg.name, country: v.pkg.country, signedOff: !!v.signoff, updatedAt: v.updatedAt } : i)) }
      : old,
  );

/** Stable empty draft, so selecting "no edits" doesn't re-render. */
const NO_DRAFT: Change = {};

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'The change could not be saved');

/** The analyst's current package, its live edits and its server-side analysis. */
export function PackageProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const id = useCurrentPackage((s) => s.id);
  const setId = useCurrentPackage((s) => s.setId);
  const draft = useCurrentPackage((s) => (s.id && s.drafts[s.id]) || NO_DRAFT);
  // Which packages have unsaved edits; the queue lives outside React and reports changes here.
  const [busyIds, setBusyIds] = useState<string[]>([]);

  // Created once. Callbacks only use state setters and the query client, which are stable.
  const [queue] = useState(() => {
    const holder: { q?: WriteQueue } = {};
    const sync = () => setTimeout(() => holder.q && setBusyIds(holder.q.busyIds()), 0);
    holder.q = createWriteQueue({
      patch: client.patchPackage,
      fork: (fromId) => client.createPackage({ fromId }),
      onApplied: (v) => {
        qc.setQueryData(qk.pkg(v.id), v);
        useCurrentPackage.getState().setDraft(v.id, holder.q?.pending(v.id) ?? {});
        summarise(qc, v);
        sync();
      },
      onSwitch: (copy) => {
        qc.setQueryData(qk.pkg(copy.id), copy);
        void qc.invalidateQueries({ queryKey: qk.packages });
        // Show the copy only if the example is still on screen; otherwise just carry the edits.
        const showing = useCurrentPackage.getState().id === EXAMPLE_ID;
        useCurrentPackage.getState().adoptCopy(EXAMPLE_ID, copy.id);
        if (showing) toast('Saved as your own copy', { description: 'The example stays as it is.' });
        sync();
      },
      onConflict: (current, outcome) => {
        qc.setQueryData(qk.pkg(current.id), current);
        useCurrentPackage.getState().setDraft(current.id, holder.q?.pending(current.id) ?? {});
        toast(outcome === 'reapplied' ? 'Updated elsewhere — your change was re-applied' : 'Updated elsewhere — your change was discarded');
        sync();
      },
      onError: (e, failedId) => {
        // Edits the queue still holds (e.g. while the API is unreachable) stay on screen.
        useCurrentPackage.getState().setDraft(failedId, holder.q?.pending(failedId) ?? {});
        reportFailure(e);
        const down = isUnreachable(e) || (e instanceof ApiError && e.status >= 500);
        if (!down && !(e instanceof ApiError && e.status === 404)) {
          toast.error(errorText(e));
          void qc.invalidateQueries({ queryKey: qk.pkg(failedId) });
        }
        sync();
      },
    });
    return Object.assign(holder.q, { sync });
  });

  // Decide which package to open once in the browser (server and first render agree on "none yet").
  useEffect(() => {
    setId(initialPackageId(window.location.search, window.localStorage ?? null));
    void importLegacyScenario(window.localStorage, client.importPackage).then((v) => {
      if (!v) return;
      qc.setQueryData(qk.pkg(v.id), v);
      void qc.invalidateQueries({ queryKey: qk.packages });
      setId(v.id);
      toast(`Your saved scenario was imported as “${v.pkg.name}”`);
    });
  }, [qc, setId]);

  // The cache is kept current from every save response, so it is never refetched on its own:
  // a background refetch started before a save could land after it and show older data.
  // Errors and conflicts refresh it explicitly.
  const query = useQuery({
    queryKey: qk.pkg(id ?? ''),
    queryFn: () => client.getPackage(id!),
    enabled: !!id,
    staleTime: Infinity,
    retry: (n, e) => n < 2 && !(e instanceof ApiError && e.status < 500),
  });

  // A package deleted elsewhere (or a stale link) falls back to the example.
  useEffect(() => {
    if (id && id !== EXAMPLE_ID && query.error instanceof ApiError && query.error.status === 404) {
      setId(EXAMPLE_ID);
      toast('That package no longer exists — showing the example');
    }
  }, [id, query.error, setId]);

  const view = query.data;

  // Read the id when the edit happens, not when the callback was made: the
  // example may have just been copied and switched to.
  const edit = useCallback(
    (change: Change) => {
      const current = useCurrentPackage.getState().id;
      const v = current ? qc.getQueryData<PackageView>(qk.pkg(current)) : undefined;
      if (!v) return;
      useCurrentPackage.getState().mergeDraft(v.id, change);
      queue.edit(v.id, v.version, v.example, change);
      queue.sync();
    },
    [qc, queue],
  );

  const flush = useCallback(() => queue.flush(), [queue]);

  // Other changes go through the same queue as edits: after pending edits, one
  // at a time, on the latest version (copying the example first if needed).
  const mutate = useCallback(
    async (fn: (id: string, version: number) => Promise<PackageView>): Promise<PackageView | null> => {
      const current = useCurrentPackage.getState().id;
      const v = current ? qc.getQueryData<PackageView>(qk.pkg(current)) : undefined;
      if (!v) return null;
      try {
        const out = await queue.run(v.id, v.version, v.example, fn);
        void qc.invalidateQueries({ queryKey: qk.portfolio(out.id) });
        void qc.invalidateQueries({ queryKey: qk.packages });
        return out;
      } catch (e) {
        reportFailure(e);
        if (e instanceof ApiError && e.slug === 'version-conflict' && e.problem.current) {
          qc.setQueryData(qk.pkg(e.problem.current.id), e.problem.current);
          toast('Updated elsewhere — check the latest version and try again');
        } else if (!isUnreachable(e)) {
          toast.error(errorText(e));
        }
        return null;
      } finally {
        queue.sync();
      }
    },
    [qc, queue],
  );

  // Rebuilt on every provider render (state changes and queue ticks), so `updating` stays current.
  const value: PackageContext = {
    id,
    setId,
    view,
    pkg: view && { ...view.pkg, ...draft.pkg },
    criteria: view && { ...view.criteria, ...draft.criteria },
    analysis: view?.analysis,
    updating: !!id && busyIds.includes(id),
    edit,
    flush,
    mutate,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePackage(): PackageContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePackage needs <PackageProvider>');
  return ctx;
}

/** The current package once loaded. Only for components rendered under a loaded-package gate. */
export function useLoadedPackage() {
  const ctx = usePackage();
  if (!ctx.view || !ctx.pkg || !ctx.criteria || !ctx.analysis) throw new Error('useLoadedPackage before the package loaded');
  return { ...ctx, view: ctx.view, pkg: ctx.pkg, criteria: ctx.criteria, analysis: ctx.analysis };
}
