'use client';

import { useEffect, useRef, useState } from 'react';

interface State<T> {
  key: string | null;
  data?: T;
  error?: unknown;
}

/**
 * Run an async loader whenever `key` changes. `key` must encode every input
 * the loader uses. While a new key loads, `previous` keeps the last result so
 * the screen does not flash empty.
 */
export function useAsync<T>(key: string | null, load: () => Promise<T>) {
  const [state, setState] = useState<State<T>>({ key: null });
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  useEffect(() => {
    if (key === null) return;
    let alive = true;
    loader.current().then(
      (data) => alive && setState({ key, data }),
      (error: unknown) => alive && setState({ key, error }),
    );
    return () => {
      alive = false;
    };
  }, [key]);
  const current = state.key === key ? state : null;
  return {
    data: current?.data,
    error: current?.error,
    loading: key !== null && !current,
    previous: state.data,
  };
}
