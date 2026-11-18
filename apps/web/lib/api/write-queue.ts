import { ApiError, isUnreachable } from './client';
import type { Criteria, Package, PackageView } from './types';

export interface Change {
  pkg?: Partial<Package>;
  criteria?: Partial<Criteria>;
}

export interface WriteQueueDeps {
  patch: (id: string, body: { version: number } & Change) => Promise<PackageView>;
  /** Copy the (read-only) example so edits can land on the copy. */
  fork: (fromId: string) => Promise<PackageView>;
  onApplied: (view: PackageView) => void;
  /** The example was copied; the caller decides whether to show the copy. */
  onSwitch: (view: PackageView) => void;
  /** Another tab or visitor saved first. The pending change was re-applied once, or discarded after a second conflict. */
  onConflict: (current: PackageView, outcome: 'reapplied' | 'discarded') => void;
  /** A save failed. When the API was unreachable, the edit is kept and sent again on the next edit or flush. */
  onError: (error: unknown, id: string) => void;
  delayMs?: number;
}

interface Slot {
  version: number;
  pending: Change | null;
  inFlight: Promise<void> | null;
  timer: ReturnType<typeof setTimeout> | null;
  /** Conflicts in a row for the change being retried. */
  conflicts: number;
  /** The API was unreachable: hold edits until the next edit or flush instead of retrying in a loop. */
  stalled: boolean;
  /** Other changes (`run`) on this package, one at a time. */
  runs: Promise<unknown>;
}

const merge = (a: Change | null, b: Change): Change => {
  const out: Change = { ...a };
  if (b.pkg) out.pkg = { ...a?.pkg, ...b.pkg };
  if (b.criteria) out.criteria = { ...a?.criteria, ...b.criteria };
  return out;
};

/**
 * Every write to a package goes through here: live edits (coalesced, at most
 * one request in flight, each based on the version the previous one returned)
 * and other changes (`run`), which wait for the package to be idle. The
 * example is copied once on the first write, however many arrive meanwhile.
 * An edit is re-applied once if someone else saved first, and kept if the API
 * could not be reached.
 */
export function createWriteQueue(deps: WriteQueueDeps) {
  const delay = deps.delayMs ?? 150;
  const slots = new Map<string, Slot>();
  const forks = new Map<string, Promise<PackageView>>();
  /** Edits made on the example while its copy is being created; never sent to the example itself. */
  const forkPending = new Map<string, Change>();

  const slot = (id: string, version: number): Slot => {
    let s = slots.get(id);
    if (!s) {
      s = { version, pending: null, inFlight: null, timer: null, conflicts: 0, stalled: false, runs: Promise.resolve() };
      slots.set(id, s);
    } else if (!s.inFlight && !s.pending) {
      s.version = Math.max(s.version, version);
    }
    return s;
  };

  const schedule = (id: string, s: Slot) => {
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => send(id), delay);
  };

  function send(id: string): void {
    const s = slots.get(id);
    if (!s) return;
    if (s.timer) {
      clearTimeout(s.timer);
      s.timer = null;
    }
    if (s.inFlight || !s.pending) return;
    const change = s.pending;
    s.pending = null;
    s.inFlight = deps
      .patch(id, { version: s.version, ...change })
      .then(
        (view) => {
          s.version = view.version;
          s.conflicts = 0;
          deps.onApplied(view);
        },
        (e: unknown) => {
          if (e instanceof ApiError && e.slug === 'version-conflict' && e.problem.current) {
            const current = e.problem.current;
            s.version = current.version;
            s.conflicts += 1;
            if (s.conflicts <= 1) {
              s.pending = merge(change, s.pending ?? {});
              deps.onConflict(current, 'reapplied');
            } else {
              s.conflicts = 0;
              deps.onConflict(current, 'discarded');
            }
            return;
          }
          if (isUnreachable(e) || (e instanceof ApiError && e.status >= 500)) {
            // Keep the edit for when the API is back.
            s.pending = merge(change, s.pending ?? {});
            s.stalled = true;
          } else if (e instanceof ApiError && e.status === 404) {
            s.pending = null;
          }
          deps.onError(e, id);
        },
      )
      .finally(() => {
        s.inFlight = null;
        if (s.pending && !s.stalled) send(id);
      });
  }

  /** The copy of `fromId`, made once however many writes ask for it. */
  function forkOnce(fromId: string): Promise<PackageView> {
    const existing = forks.get(fromId);
    if (existing) return existing;
    const p = deps.fork(fromId).then(
      (copy) => {
        const moved = forkPending.get(fromId);
        forkPending.delete(fromId);
        deps.onSwitch(copy);
        if (moved) edit(copy.id, copy.version, false, moved);
        return copy;
      },
      (e: unknown) => {
        forkPending.delete(fromId);
        deps.onError(e, fromId);
        throw e;
      },
    );
    forks.set(
      fromId,
      p.finally(() => forks.delete(fromId)),
    );
    return p;
  }

  function edit(id: string, version: number, isExample: boolean, change: Change): void {
    if (isExample) {
      forkPending.set(id, merge(forkPending.get(id) ?? null, change));
      forkOnce(id).catch(() => undefined);
      return;
    }
    const s = slot(id, version);
    s.pending = merge(s.pending, change);
    s.stalled = false;
    schedule(id, s);
  }

  /** Wait until this package has no pending or in-flight edit. */
  async function idle(id: string): Promise<void> {
    const s = slots.get(id);
    while (s && (s.pending || s.inFlight)) {
      s.stalled = false;
      send(id);
      if (s.inFlight) await s.inFlight;
      if (s.stalled) throw new TypeError('The API is unreachable');
    }
  }

  /**
   * Run another change (sign-off, benchmark, countries, contracts, reset) on a
   * package: after its pending edits, one at a time, on the latest version.
   * Edits made meanwhile are sent after it, on the version it returned.
   */
  async function run(id: string, version: number, isExample: boolean, fn: (id: string, version: number) => Promise<PackageView>): Promise<PackageView> {
    if (isExample) {
      const copy = await forkOnce(id);
      id = copy.id;
      version = copy.version;
    }
    const s = slot(id, version);
    const go = async () => {
      await idle(id);
      let release!: () => void;
      s.inFlight = new Promise<void>((r) => (release = r));
      try {
        const view = await fn(id, s.version);
        s.version = view.version;
        deps.onApplied(view);
        return view;
      } finally {
        s.inFlight = null;
        release();
        if (s.pending && !s.stalled) send(id);
      }
    };
    const result = s.runs.then(go, go);
    s.runs = result.catch(() => undefined);
    return result;
  }

  /** Send everything now; resolves once every package has no pending or in-flight write. */
  async function flush(): Promise<void> {
    for (;;) {
      for (const [id, s] of slots) {
        s.stalled = false;
        send(id);
      }
      const busy = [...slots.values()].map((s) => s.inFlight).filter(Boolean);
      if (!busy.length && !forks.size) return;
      await Promise.all([...busy, ...[...forks.values()].map((f) => f.catch(() => undefined))]);
      if ([...slots.values()].some((s) => s.stalled)) return;
    }
  }

  const busy = (id: string): boolean => {
    const s = slots.get(id);
    return (!!s && (!!s.pending || !!s.inFlight)) || forks.has(id);
  };

  return {
    edit,
    run,
    flush,
    busy,
    /** Every package with edits waiting, a save in flight, or a copy being made. */
    busyIds: (): string[] => [...new Set([...slots.keys(), ...forks.keys()])].filter(busy),
    /** Edits not yet saved for this package (shown on top of the last saved state). */
    pending: (id: string): Change | null => slots.get(id)?.pending ?? forkPending.get(id) ?? null,
  };
}

export type WriteQueue = ReturnType<typeof createWriteQueue>;
