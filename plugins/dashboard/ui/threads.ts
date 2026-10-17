import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export type Attention = "input" | "failed" | "queue-failed" | "done";

export const ATTENTION_LABEL: Readonly<Record<Attention, string>> = {
  input: "Needs input",
  failed: "Failed",
  "queue-failed": "Queued message failed",
  done: "Done",
};

const ATTENTION_ORDER: readonly Attention[] = ["input", "failed", "queue-failed", "done"];

type ThreadFields = Pick<
  PluginSidebarThread,
  "id" | "projectId" | "status" | "runtimeStatus" | "indicator" | "hasPendingInteraction" | "isHidden" | "latestAttentionAt" | "updatedAt"
>;

/** Why a thread is waiting on the user, from the same signals as bb's own row indicator. */
export function attentionOf(thread: ThreadFields): Attention | null {
  if (thread.hasPendingInteraction || thread.indicator === "waiting-for-input") return "input";
  if (thread.indicator === "unread-error") return "failed";
  if (thread.indicator === "queued-failed") return "queue-failed";
  if (thread.indicator === "unread-success") return "done";
  return null;
}

const BUSY = new Set(["starting", "active", "stopping", "provisioning", "waiting-for-host"]);

export function isRunning(thread: ThreadFields): boolean {
  return BUSY.has(thread.runtimeStatus) || BUSY.has(thread.status);
}

export interface ThreadGroups<T> {
  needsYou: { thread: T; attention: Attention }[];
  running: T[];
}

/**
 * Splits the visible threads of a project (all projects when `projectId` is null) into the ones
 * waiting on the user, most urgent first, and the ones still working. A thread blocked on a
 * question is both, and shows only under the first.
 */
export function groupThreads<T extends ThreadFields>(threads: readonly T[], projectId: string | null): ThreadGroups<T> {
  const needsYou: { thread: T; attention: Attention }[] = [];
  const running: T[] = [];
  for (const thread of threads) {
    if (thread.isHidden || (projectId !== null && thread.projectId !== projectId)) continue;
    const attention = attentionOf(thread);
    if (attention !== null) needsYou.push({ thread, attention });
    else if (isRunning(thread)) running.push(thread);
  }
  needsYou.sort(
    (a, b) => ATTENTION_ORDER.indexOf(a.attention) - ATTENTION_ORDER.indexOf(b.attention) || b.thread.latestAttentionAt - a.thread.latestAttentionAt,
  );
  running.sort((a, b) => b.updatedAt - a.updatedAt);
  return { needsYou, running };
}
