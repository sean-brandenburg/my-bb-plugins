import { useCallback, useEffect, useMemo, useState } from "react";
import { useBbNavigate, experimental_usePluginId as usePluginId, experimental_useSidebarThreadActions as useSidebarThreadActions, experimental_useSidebarThreads as useSidebarThreads, useRealtime, useRpc, useSdk,  } from "@get-bb/plugin-sdk/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../contract";
import type { Board } from "../shared/board";
import { BOARD_CHANGED } from "../shared/events";
import { errorMessage } from "./format";

export type Rpc = ReturnType<typeof useRpc<typeof rpcContract>>;

export interface ProjectOption {
  id: string;
  name: string;
}

export function useBoard() {
  const rpc = useRpc<typeof rpcContract>();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refetch = useCallback(() => {
    rpc.call("board_get").then(
      (next) => {
        setBoard(next);
        setError(null);
      },
      (cause: unknown) => setError(errorMessage(cause)),
    );
  }, [rpc]);
  useEffect(() => {
    refetch();
  }, [refetch]);
  useRealtime(BOARD_CHANGED, refetch);
  return { rpc, board, setBoard, error, refetch };
}

export function useProjects(): ProjectOption[] {
  const sdk = useSdk();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    sdk.projects.list().then(
      (list) => {
        if (cancelled) return;
        setProjects(list.map((project) => ({ id: project.id, name: project.name })));
      },
      () => {
        if (!cancelled) setProjects([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sdk]);
  return projects;
}

export function useThreadIndex(): ReadonlyMap<string, PluginSidebarThread> {
  const { threads } = useSidebarThreads({ experimental_lifecycles: ["active", "archived"] });
  return useMemo(() => new Map(threads.map((thread) => [thread.id, thread])), [threads]);
}

/** Sidebar `open` silently ignores threads the sidebar does not list, which includes every hidden code review thread. */
export function useOpenThread(): (threadId: string) => void {
  const actions = useSidebarThreadActions();
  const navigate = useBbNavigate();
  const threads = useThreadIndex();
  return useCallback(
    (threadId: string) => {
      if (threads.has(threadId)) actions.open(threadId);
      else navigate.toThread(threadId);
    },
    [actions, navigate, threads],
  );
}

/** "Push after applying" is a per-user habit, so it lives in localStorage rather than on the card. */
export function usePushPreference(): [boolean, (next: boolean) => void] {
  const pluginId = usePluginId();
  const key = `${pluginId}:pushAfterApply`;
  const [push, setPush] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(key) !== "false";
    } catch {
      return true;
    }
  });
  const update = (next: boolean) => {
    setPush(next);
    try {
      window.localStorage.setItem(key, String(next));
    } catch {
      // Private mode or quota: keep the in-memory value for this session.
    }
  };
  return [push, update];
}

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
