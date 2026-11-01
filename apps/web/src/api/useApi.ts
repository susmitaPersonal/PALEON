import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "./client";

export type Loadable<T> = { data: T | null; error: string | null; loading: boolean; retry: () => void };

/** Loads on mount and when the key changes. A response for a stale key is ignored. */
export function useApi<T>(load: () => Promise<T>, key: string): Loadable<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState({ data: null, error: null, loading: true });
    load().then(
      (data) => { if (current) setState({ data, error: null, loading: false }); },
      (error: unknown) => {
        const message = error instanceof ApiClientError ? error.message : "Something went wrong.";
        if (current) setState({ data: null, error: message, loading: false });
      },
    );
    return () => { current = false; };
    // The key identifies the request. `load` is a new closure on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  return { ...state, retry: useCallback(() => setAttempt((value) => value + 1), []) };
}
