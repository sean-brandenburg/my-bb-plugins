import { useCallback, useEffect, useRef, useState } from "react";
import type { DiffResult } from "../types";
import { errorMessage } from "./format";
import type { DiffSource } from "./source";
import { setInstanceLoading, useDiffInstance } from "./state";

/** The source's diff, refetched (bypassing its cache) whenever the paired `DiffRefreshButton` asks; the last good diff stays up on error. */
export function useDiffResult(source: DiffSource, instanceKey: string): { diff: DiffResult | null; error: string | null } {
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(
    (refresh: boolean) => {
      setLoading(true);
      source.getDiff(refresh).then(
        (result) => {
          setDiff(result);
          setError(null);
          setLoading(false);
        },
        (cause: unknown) => {
          setError(errorMessage(cause));
          setLoading(false);
        },
      );
    },
    [source],
  );
  useEffect(() => reload(false), [reload]);
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
