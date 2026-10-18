// Loading data in components.
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { errorMessage } from "./format";

export interface Async<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  reload: () => void;
  set: (data: T) => void;
}

/**
 * useAsync runs load when deps change and keeps its latest result; results
 * of earlier runs that finish late are dropped.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const run = useRef(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = ++run.current;
    setState((s) => ({ data: s.data, loading: true }));
    load().then(
      (data) => id === run.current && setState({ data, loading: false }),
      (err) => id === run.current && setState({ error: errorMessage(err), loading: false }),
    );
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const set = useCallback((data: T) => setState({ data, loading: false }), []);
  return { data: state.data, error: state.error, loading: state.loading, reload, set };
}

/** debounce returns fn delayed until calls stop for ms. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** throttle returns fn run at most once every ms, the last call included. */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | undefined;
  return (...args: A) => {
    const now = Date.now();
    pending = args;
    if (now - last >= ms) {
      last = now;
      fn(...args);
      pending = undefined;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      last = Date.now();
      if (pending) fn(...pending);
      pending = undefined;
    }, ms - (now - last));
  };
}

/** store wraps localStorage, which may be unavailable. */
export const local = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable: the value is a convenience only.
    }
  },
};
