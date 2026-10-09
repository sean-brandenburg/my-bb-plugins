import { compareCodepoint } from "./compare-codepoint.js";
import type { SidebarThread } from "./sidebar-thread.js";

export interface ProjectThreadNode {
  thread: SidebarThread;
  children: ProjectThreadNode[];
}

export type ThreadComparator = (
  left: SidebarThread,
  right: SidebarThread,
) => number;

type SidebarProjectThreadShape = Pick<SidebarThread, "isHidden">;

interface BuildThreadNodeArgs {
  childrenByParentId: ReadonlyMap<string, readonly SidebarThread[]>;
  compareThreads: ThreadComparator;
  thread: SidebarThread;
  visitedThreadIds: Set<string>;
}

export function compareByCreatedAtDescending(
  left: SidebarThread,
  right: SidebarThread,
): number {
  const createdAtDelta = right.createdAt - left.createdAt;
  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return compareCodepoint(left.id, right.id);
}

function compareByLatestAttentionAtDescending(
  left: SidebarThread,
  right: SidebarThread,
): number {
  const latestAttentionAtDelta =
    right.latestAttentionAt - left.latestAttentionAt;
  if (latestAttentionAtDelta !== 0) {
    return latestAttentionAtDelta;
  }

  return compareByCreatedAtDescending(left, right);
}

export function compareStandardThreads(
  left: SidebarThread,
  right: SidebarThread,
): number {
  const leftIsActive = left.status === "active";
  const rightIsActive = right.status === "active";

  if (leftIsActive !== rightIsActive) {
    return leftIsActive ? -1 : 1;
  }

  if (leftIsActive) {
    return compareByCreatedAtDescending(left, right);
  }

  return compareByLatestAttentionAtDescending(left, right);
}

function sortNodes(
  nodes: ProjectThreadNode[],
  compareThreads: ThreadComparator,
): ProjectThreadNode[] {
  return nodes.sort((left, right) => compareThreads(left.thread, right.thread));
}

function buildThreadNode({
  childrenByParentId,
  compareThreads,
  thread,
  visitedThreadIds,
}: BuildThreadNodeArgs): ProjectThreadNode {
  visitedThreadIds.add(thread.id);
  const children: ProjectThreadNode[] = [];

  // Ancestors are already visited, so this also cuts parent cycles.
  for (const childThread of childrenByParentId.get(thread.id) ?? []) {
    if (visitedThreadIds.has(childThread.id)) continue;

    children.push(
      buildThreadNode({
        childrenByParentId,
        compareThreads,
        thread: childThread,
        visitedThreadIds,
      }),
    );
  }

  return { thread, children: sortNodes(children, compareThreads) };
}

function isRootThread(
  thread: SidebarThread,
  projectThreadIds: ReadonlySet<string>,
): boolean {
  return (
    thread.parentThreadId === null ||
    !projectThreadIds.has(thread.parentThreadId)
  );
}

export function createSidebarProjectIdResolver(
  threadById: ReadonlyMap<string, SidebarThread>,
): (thread: SidebarThread) => string {
  const sidebarProjectIdByThreadId = new Map<string, string>();
  return (thread) => {
    const cached = sidebarProjectIdByThreadId.get(thread.id);
    if (cached !== undefined) {
      return cached;
    }
    const chain: SidebarThread[] = [thread];
    const visitedThreadIds = new Set<string>([thread.id]);
    let current = thread;
    let resolved: string | undefined;
    while (current.parentThreadId !== null) {
      const parent = threadById.get(current.parentThreadId);
      if (parent === undefined || visitedThreadIds.has(parent.id)) {
        break;
      }
      const parentResolved = sidebarProjectIdByThreadId.get(parent.id);
      if (parentResolved !== undefined) {
        resolved = parentResolved;
        break;
      }
      visitedThreadIds.add(parent.id);
      chain.push(parent);
      current = parent;
    }
    const sidebarProjectId = resolved ?? current.projectId;
    for (const member of chain) {
      sidebarProjectIdByThreadId.set(member.id, sidebarProjectId);
    }
    return sidebarProjectId;
  };
}

/**
 * Children nest under their parent when it is in the list; a child whose
 * parent isn't listed becomes a root. Hidden threads (side chats) are left out.
 */
export function buildThreadTree(
  allThreads: readonly SidebarThread[],
  compareThreads: ThreadComparator = compareStandardThreads,
): ProjectThreadNode[] {
  const projectThreads = allThreads.filter(isSidebarProjectThread);
  const projectThreadIds = new Set(projectThreads.map((thread) => thread.id));
  const childrenByParentId = new Map<string, SidebarThread[]>();

  for (const thread of projectThreads) {
    if (thread.parentThreadId === null) continue;
    if (!projectThreadIds.has(thread.parentThreadId)) continue;

    const children = childrenByParentId.get(thread.parentThreadId);
    if (children) {
      children.push(thread);
    } else {
      childrenByParentId.set(thread.parentThreadId, [thread]);
    }
  }

  const visitedThreadIds = new Set<string>();
  const rootNodes: ProjectThreadNode[] = [];

  for (const thread of projectThreads) {
    if (!isRootThread(thread, projectThreadIds)) continue;
    if (visitedThreadIds.has(thread.id)) continue;

    rootNodes.push(
      buildThreadNode({
        childrenByParentId,
        compareThreads,
        thread,
        visitedThreadIds,
      }),
    );
  }

  // Whatever is left sits on a parent cycle with no root above it.
  for (const thread of projectThreads) {
    if (visitedThreadIds.has(thread.id)) continue;

    rootNodes.push(
      buildThreadNode({
        childrenByParentId,
        compareThreads,
        thread,
        visitedThreadIds,
      }),
    );
  }

  return sortNodes(rootNodes, compareThreads);
}

export function isSidebarProjectThread(
  thread: SidebarProjectThreadShape,
): boolean {
  return !thread.isHidden;
}
