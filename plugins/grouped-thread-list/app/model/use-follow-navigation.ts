import { useEffect, useRef } from "react";
import { useBbContext } from "@get-bb/plugin-sdk/app";
import { usePreferencesReady } from "../preferences/PreferencesSync.js";
import { useSidebarData } from "./use-sidebar-data.js";
import { useActiveProject } from "./use-active-project.js";

/**
 * Opening a thread makes its project the active one, so the picker and new
 * threads default to whatever you are working in. Personal threads leave it
 * alone. Only a change of route counts, not later updates to the same thread.
 */
export function useFollowNavigation(): void {
  const { threadId } = useBbContext();
  const { status } = useSidebarData();
  const preferencesReady = usePreferencesReady();
  const { personalProjectId, resolveProjectId, setActiveProjectId, threads } =
    useActiveProject();
  const handledThreadId = useRef<string | null>(null);
  useEffect(() => {
    if (threadId === null) {
      handledThreadId.current = null;
      return;
    }
    if (!preferencesReady || status !== "ready") return;
    if (handledThreadId.current === threadId) return;
    const thread = threads.find((candidate) => candidate.id === threadId);
    if (thread === undefined) return;
    handledThreadId.current = threadId;
    const projectId = resolveProjectId(thread);
    if (projectId !== personalProjectId) setActiveProjectId(projectId);
  }, [
    personalProjectId,
    preferencesReady,
    resolveProjectId,
    setActiveProjectId,
    status,
    threadId,
    threads,
  ]);
}
