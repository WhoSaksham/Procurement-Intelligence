import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/client';
import type { PackageView } from '@/lib/api/types';
import { createWriteQueue, type WriteQueueDeps } from '@/lib/api/write-queue';

type Body = { version: number; pkg?: Record<string, unknown>; criteria?: Record<string, unknown> };

const view = (id: string, version: number, extra: Partial<PackageView> = {}) => ({ id, version, example: id === 'example', ...extra }) as PackageView;

/** A promise the test resolves by hand, to control when the "server" answers. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(over: Partial<WriteQueueDeps> = {}) {
  const calls: { id: string; body: Body }[] = [];
  const answers: ReturnType<typeof deferred<PackageView>>[] = [];
  const deps: WriteQueueDeps = {
    patch: vi.fn((id: string, body: Body) => {
      calls.push({ id, body });
      const d = deferred<PackageView>();
      answers.push(d);
      return d.promise;
    }),
    fork: vi.fn(async () => view('copy1', 1)),
    onApplied: vi.fn(),
    onSwitch: vi.fn(),
    onConflict: vi.fn(),
    onError: vi.fn(),
    delayMs: 150,
    ...over,
  };
  return { q: createWriteQueue(deps), deps, calls, answers };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('write queue', () => {
  it('coalesces a burst of edits into one patch', async () => {
    const { q, calls } = setup();
    q.edit('a', 1, false, { pkg: { value: 1 } });
    q.edit('a', 1, false, { pkg: { value: 2, lots: 3 } });
    q.edit('a', 1, false, { criteria: { turnover: 9 } });
    await vi.advanceTimersByTimeAsync(149);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([{ id: 'a', body: { version: 1, pkg: { value: 2, lots: 3 }, criteria: { turnover: 9 } } }]);
  });

  it('never has two requests in flight for one package, and uses the version the previous patch returned', async () => {
    const { q, calls, answers, deps } = setup();
    q.edit('a', 1, false, { pkg: { value: 1 } });
    await vi.advanceTimersByTimeAsync(150);
    q.edit('a', 1, false, { pkg: { value: 2 } });
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(1);
    answers[0].resolve(view('a', 2));
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.onApplied).toHaveBeenCalledWith(view('a', 2));
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toEqual({ version: 2, pkg: { value: 2 } });
  });

  it('write queue binds edits to the package id at enqueue time', async () => {
    const { q, calls } = setup();
    q.edit('a', 4, false, { pkg: { value: 1 } });
    q.edit('b', 7, false, { pkg: { lots: 2 } });
    await vi.advanceTimersByTimeAsync(150);
    expect(calls).toEqual([
      { id: 'a', body: { version: 4, pkg: { value: 1 } } },
      { id: 'b', body: { version: 7, pkg: { lots: 2 } } },
    ]);
  });

  it('forks the example once for a burst of edits', async () => {
    const fork = deferred<PackageView>();
    const { q, calls, deps } = setup({ fork: vi.fn(() => fork.promise) });
    q.edit('example', 1, true, { pkg: { value: 1 } });
    q.edit('example', 1, true, { pkg: { lots: 2 } });
    q.edit('example', 1, true, { criteria: { turnover: 5 } });
    await vi.advanceTimersByTimeAsync(500);
    expect(deps.fork).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
    fork.resolve(view('copy1', 1));
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.onSwitch).toHaveBeenCalledTimes(1);
    expect(deps.onSwitch).toHaveBeenCalledWith(view('copy1', 1));
    await vi.advanceTimersByTimeAsync(150);
    expect(calls).toEqual([{ id: 'copy1', body: { version: 1, pkg: { value: 1, lots: 2 }, criteria: { turnover: 5 } } }]);
  });

  it('flush while the example is being copied never patches the example', async () => {
    const fork = deferred<PackageView>();
    const { q, calls } = setup({ fork: vi.fn(() => fork.promise) });
    q.edit('example', 1, true, { pkg: { plannedDays: 150 } });
    const flushed = q.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(0);
    fork.resolve(view('copy1', 1));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([{ id: 'copy1', body: { version: 1, pkg: { plannedDays: 150 } } }]);
    expect(calls.some((c) => c.id === 'example')).toBe(false);
    void flushed;
  });

  it('re-applies once after a version conflict, then gives up', async () => {
    const { q, calls, answers, deps } = setup();
    q.edit('a', 1, false, { pkg: { lots: 2 } });
    await vi.advanceTimersByTimeAsync(150);
    answers[0].reject(new ApiError(409, { type: 'https://procurement.dev/problems/version-conflict', current: view('a', 5) }));
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.onConflict).toHaveBeenCalledWith(view('a', 5), 'reapplied');
    expect(calls[1]).toEqual({ id: 'a', body: { version: 5, pkg: { lots: 2 } } });
    answers[1].reject(new ApiError(409, { type: 'https://procurement.dev/problems/version-conflict', current: view('a', 6) }));
    await vi.advanceTimersByTimeAsync(500);
    expect(deps.onConflict).toHaveBeenLastCalledWith(view('a', 6), 'discarded');
    expect(calls).toHaveLength(2);
  });

  it('drops pending edits for a package that no longer exists', async () => {
    const { q, calls, answers, deps } = setup();
    q.edit('a', 1, false, { pkg: { lots: 2 } });
    await vi.advanceTimersByTimeAsync(150);
    q.edit('a', 1, false, { pkg: { lots: 3 } });
    answers[0].reject(new ApiError(404, { type: 'https://procurement.dev/problems/not-found' }));
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(1);
    expect(deps.onError).toHaveBeenCalledWith(expect.any(ApiError), 'a');
    expect(q.pending('a')).toBeNull();
  });

  it('flush sends immediately and resolves when the server has answered', async () => {
    const { q, calls, answers } = setup();
    q.edit('a', 1, false, { pkg: { plannedDays: 200 } });
    const done = q.flush();
    expect(calls).toHaveLength(1);
    let settled = false;
    void done.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    answers[0].resolve(view('a', 2));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
  });

  it('reports pending changes and busy state per package', async () => {
    const { q, answers } = setup();
    expect(q.busy('a')).toBe(false);
    q.edit('a', 1, false, { pkg: { value: 3 } });
    expect(q.pending('a')).toEqual({ pkg: { value: 3 } });
    expect(q.busy('a')).toBe(true);
    await vi.advanceTimersByTimeAsync(150);
    expect(q.pending('a')).toBeNull();
    expect(q.busy('a')).toBe(true);
    answers[0].resolve(view('a', 2));
    await vi.advanceTimersByTimeAsync(0);
    expect(q.busy('a')).toBe(false);
  });

  it('lists the packages that are busy', async () => {
    const { q, answers } = setup();
    q.edit('a', 1, false, { pkg: { value: 3 } });
    q.edit('b', 1, false, { pkg: { value: 4 } });
    expect(q.busyIds().sort()).toEqual(['a', 'b']);
    await vi.advanceTimersByTimeAsync(150);
    answers[0].resolve(view('a', 2));
    await vi.advanceTimersByTimeAsync(0);
    expect(q.busyIds()).toEqual(['b']);
  });

  it('keeps an edit when the API is unreachable, without retrying in a loop, and resends it on flush', async () => {
    const { q, calls, answers, deps } = setup();
    q.edit('a', 1, false, { pkg: { lots: 2 } });
    await vi.advanceTimersByTimeAsync(150);
    answers[0].reject(new TypeError('fetch failed'));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls).toHaveLength(1);
    expect(q.pending('a')).toEqual({ pkg: { lots: 2 } });
    expect(deps.onError).toHaveBeenCalledWith(expect.any(TypeError), 'a');
    void q.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls[1]).toEqual({ id: 'a', body: { version: 1, pkg: { lots: 2 } } });
  });

  it('run waits for pending edits and uses the version they returned', async () => {
    const { q, calls, answers } = setup();
    q.edit('a', 1, false, { pkg: { lots: 2 } });
    const fn = vi.fn(async (id: string, version: number) => view(id, version + 1));
    const ran = q.run('a', 1, false, fn);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    expect(fn).not.toHaveBeenCalled();
    answers[0].resolve(view('a', 2));
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledWith('a', 2);
    expect(await ran).toEqual(view('a', 3));
  });

  it('an edit made while a run is in flight is sent after it, on the version the run returned', async () => {
    const done = deferred<PackageView>();
    const { q, calls, deps } = setup();
    const ran = q.run('a', 4, false, () => done.promise);
    await vi.advanceTimersByTimeAsync(0);
    q.edit('a', 4, false, { pkg: { lots: 3 } });
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(0);
    done.resolve(view('a', 5));
    await ran;
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.onApplied).toHaveBeenCalledWith(view('a', 5));
    expect(calls).toEqual([{ id: 'a', body: { version: 5, pkg: { lots: 3 } } }]);
  });

  it('a run on the example shares the copy a burst of edits is making', async () => {
    const fork = deferred<PackageView>();
    const { q, deps, calls, answers } = setup({ fork: vi.fn(() => fork.promise) });
    q.edit('example', 1, true, { pkg: { lots: 2 } });
    const fn = vi.fn(async (id: string, version: number) => view(id, version + 1));
    const ran = q.run('example', 1, true, fn);
    fork.resolve(view('copy1', 1));
    await vi.advanceTimersByTimeAsync(0);
    // The burst's edit goes to the copy first; the run follows on the version it returned.
    expect(calls).toEqual([{ id: 'copy1', body: { version: 1, pkg: { lots: 2 } } }]);
    answers[0].resolve(view('copy1', 2));
    const out = await ran;
    expect(deps.fork).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('copy1', 2);
    expect(out).toEqual(view('copy1', 3));
  });

  it('runs on one package happen one at a time', async () => {
    const first = deferred<PackageView>();
    const { q } = setup();
    const order: string[] = [];
    const a = q.run('a', 1, false, async () => {
      order.push('first start');
      const v = await first.promise;
      order.push('first end');
      return v;
    });
    const b = q.run('a', 1, false, async (id, version) => {
      order.push(`second start v${version}`);
      return view(id, version + 1);
    });
    await vi.advanceTimersByTimeAsync(0);
    first.resolve(view('a', 2));
    await Promise.all([a, b]);
    expect(order).toEqual(['first start', 'first end', 'second start v2']);
  });
});

