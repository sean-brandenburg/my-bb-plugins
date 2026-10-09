import { compareCodepoint } from "./compare-codepoint.js";
import {
  buildThreadTree,
  type ProjectThreadNode,
} from "./project-thread-groups.js";
import type { SidebarThread } from "./sidebar-thread.js";

function compareByPinnedFallback(
  left: SidebarThread,
  right: SidebarThread,
): number {
  const pinnedAtDelta = (right.pinnedAt ?? 0) - (left.pinnedAt ?? 0);
  if (pinnedAtDelta !== 0) {
    return pinnedAtDelta;
  }

  const createdAtDelta = right.createdAt - left.createdAt;
  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return compareCodepoint(left.id, right.id);
}

function comparePinnedRoots(left: SidebarThread, right: SidebarThread): number {
  if (left.pinSortKey !== null && right.pinSortKey !== null) {
    const pinSortKeyDelta = compareCodepoint(left.pinSortKey, right.pinSortKey);
    if (pinSortKeyDelta !== 0) {
      return pinSortKeyDelta;
    }
  }

  return compareByPinnedFallback(left, right);
}

function addDescendantThreadIds({
  childrenByParentId,
  effectivePinnedThreadIds,
  parentThreadId,
  visitedThreadIds,
}: AddDescendantThreadIdsArgs): void {
  if (visitedThreadIds.has(parentThreadId)) return;

  visitedThreadIds.add(parentThreadId);
  for (const child of childrenByParentId.get(parentThreadId) ?? []) {
    effectivePinnedThreadIds.add(child.id);
    addDescendantThreadIds({
      childrenByParentId,
      effectivePinnedThreadIds,
      parentThreadId: child.id,
      visitedThreadIds,
    });
  }
}

interface AddDescendantThreadIdsArgs {
  childrenByParentId: ReadonlyMap<string, readonly SidebarThread[]>;
  effectivePinnedThreadIds: Set<string>;
  parentThreadId: string;
  visitedThreadIds: Set<string>;
}

/**
 * Pinned threads with everything under them, as roots ordered by pin. A pinned
 * child whose parent isn't pinned becomes a root of its own.
 */
export function buildPinnedThreadTree(
  threads: readonly SidebarThread[],
): ProjectThreadNode[] {
  const explicitlyPinnedThreads = threads.filter(
    (thread) => thread.pinnedAt !== null,
  );
  const childrenByParentId = new Map<string, SidebarThread[]>();

  for (const thread of threads) {
    if (thread.parentThreadId === null) continue;

    const children = childrenByParentId.get(thread.parentThreadId);
    if (children) {
      children.push(thread);
    } else {
      childrenByParentId.set(thread.parentThreadId, [thread]);
    }
  }

  const effectivePinnedThreadIds = new Set(
    explicitlyPinnedThreads.map((thread) => thread.id),
  );
  for (const thread of explicitlyPinnedThreads) {
    addDescendantThreadIds({
      childrenByParentId,
      effectivePinnedThreadIds,
      parentThreadId: thread.id,
      visitedThreadIds: new Set(),
    });
  }

  const effectivePinnedThreads = threads.filter((thread) =>
    effectivePinnedThreadIds.has(thread.id),
  );
  return buildThreadTree(effectivePinnedThreads).sort((left, right) =>
    comparePinnedRoots(left.thread, right.thread),
  );
}
