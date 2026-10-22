import { useCallback, useEffect, useRef, useState } from "react";
import type { CommitRange, DiffResult } from "../types";
import { errorMessage } from "./format";
import type { DiffSource } from "./source";
import { setInstanceLoading, useDiffInstance } from "./state";

/**
 * The source's diff (of `range` when given), refetched (bypassing its cache) whenever the paired `DiffRefreshButton`
 * asks; the last good diff stays up on error. A new range clears the diff until its own arrives.
 */
export function useDiffResult(source: DiffSource, instanceKey: string, range: CommitRange | null = null): { diff: DiffResult | null; error: string | null } {
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Only the latest request lands, so a slow read of the previous range can't overwrite the one picked since.
  const request = useRef(0);
  const reload = useCallback(
    (refresh: boolean) => {
      const id = ++request.current;
      setLoading(true);
      source.getDiff(refresh, range).then(
        (result) => {
          if (id !== request.current) return;
          setDiff(result);
          setError(null);
          setLoading(false);
        },
        (cause: unknown) => {
          if (id !== request.current) return;
          setError(errorMessage(cause));
          setLoading(false);
        },
      );
    },
    [source, range],
  );
  const shownRange = useRef(range);
  useEffect(() => {
    if (shownRange.current !== range) {
      shownRange.current = range;
      setDiff(null);
      setError(null);
    }
    reload(false);
  }, [reload, range]);
  const { reloadNonce } = useDiffInstance(instanceKey);
  const lastReload = useRef(reloadNonce);
  useEffect(() => {
    if (lastReload.current === reloadNonce) return;
    lastReload.current = reloadNonce;
    reload(true);
  }, [reloadNonce, reload]);
  useEffect(() => {
    setInstanceLoading(instanceKey, loading);
  }, [instanceKey, loading]);
  useEffect(() => () => setInstanceLoading(instanceKey, false), [instanceKey]);
  return { diff, error };
}
