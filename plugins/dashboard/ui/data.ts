import { useRpc, useSdk } from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useRef, useState } from "react";
import type { rpcContract, WorktreeRow } from "../rpc-contract.js";

type HeldWorktrees = { pluginId: string | null; projectId: string; count: number };

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** When each thread's current turn started, from its latest `turn/started` event. */
export function useTurnStarts(threadIds: readonly string[]): ReadonlyMap<string, number> {
  const sdk = useSdk();
  const [starts, setStarts] = useState<ReadonlyMap<string, number>>(new Map());
  const key = threadIds.join(",");
  useEffect(() => {
    const controller = new AbortController();
    const ids = key === "" ? [] : key.split(",");
    void Promise.all(
      ids.map((threadId) =>
        sdk.threads.events
          .list({ threadId, types: ["turn/started"], order: "desc", limit: "1", signal: controller.signal })
          .then((rows): [string, number][] => (rows[0] === undefined ? [] : [[threadId, rows[0].createdAt]]))
          .catch((): [string, number][] => []),
      ),
    ).then((entries) => {
      if (!controller.signal.aborted) setStarts(new Map(entries.flat()));
    });
    return () => controller.abort();
  }, [sdk, key]);
  return starts;
}

export function useProjectNames(): ReadonlyMap<string, string> {
  const sdk = useSdk();
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    sdk.projects.list().then(
      (projects) => {
        if (!cancelled) setNames(new Map(projects.map((project) => [project.id, project.name])));
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [sdk]);
  return names;
}

export interface WorktreesState {
  rows: readonly WorktreeRow[] | null;
  total: number;
  held: readonly HeldWorktrees[];
  error: string | null;
  loading: boolean;
  refresh(): void;
  cleanUp(environmentId: string): Promise<void>;
}

/**
 * Worktrees with changes or no live thread. `liveThreads` changes when a thread starts or is
 * archived, which can change which worktrees are unused, so it forces a recheck.
 */
export function useWorktrees(liveThreads: string): WorktreesState {
  const rpc = useRpc<typeof rpcContract>();
  const [rows, setRows] = useState<readonly WorktreeRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [held, setHeld] = useState<readonly HeldWorktrees[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const first = useRef(true);

  const load = useCallback(
    (refresh: boolean) => {
      const id = ++request.current;
      setLoading(true);
      rpc.call("worktrees", { refresh }).then(
        (result) => {
          if (id !== request.current) return;
          setRows(result.rows);
          setTotal(result.total);
          setHeld(result.held);
          setError(null);
          setLoading(false);
        },
        (failure: unknown) => {
          if (id !== request.current) return;
          setError(failure instanceof Error ? failure.message : String(failure));
          setLoading(false);
        },
      );
    },
    [rpc],
  );

  useEffect(() => {
    const refresh = !first.current;
    first.current = false;
    const timer = setTimeout(() => load(refresh), refresh ? 1500 : 0);
    return () => clearTimeout(timer);
  }, [load, liveThreads]);

  const cleanUp = useCallback(
    async (environmentId: string) => {
      await rpc.call("cleanup_worktree", { environmentId });
      setRows((current) => current?.filter((row) => row.environmentId !== environmentId) ?? null);
      load(true);
    },
    [rpc, load],
  );

  return { rows, total, held, error, loading, refresh: () => load(true), cleanUp };
}
