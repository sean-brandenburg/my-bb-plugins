import type { SidebarProjectIdResolver } from "../model/active-project.js";
import type { SidebarThread } from "../model/sidebar-thread.js";
import {
  PINNED_ENTRY,
  threadActivityAt,
  threadRowsForEntry,
  UNREAD_ENTRY,
} from "../picker/picker-model.js";

export interface ThreadInbox {
  needsYou: SidebarThread[];
  running: SidebarThread[];
  /** Pinned roots in pin order; their children are left to the picker. */
  pinned: SidebarThread[];
}

/**
 * The picker's Unread and Pinned entries, split the way its Unread list is,
 * so the sidebar's counts always match what clicking through shows.
 */
export function buildThreadInbox(
  threads: readonly SidebarThread[],
  resolveProjectId: SidebarProjectIdResolver,
): ThreadInbox {
  const unread = threadRowsForEntry({
    entry: UNREAD_ENTRY,
    threads,
    resolveProjectId,
  });
  const pinned = threadRowsForEntry({
    entry: PINNED_ENTRY,
    threads,
    resolveProjectId,
  });
  return {
    needsYou: unread
      .filter((row) => row.section === "attention")
      .map((row) => row.thread),
    running: unread
      .filter((row) => row.section === "running")
      .map((row) => row.thread),
    pinned: pinned.filter((row) => row.depth === 0).map((row) => row.thread),
  };
}

/** Running threads sort by when they started, the rest by latest attention. */
export function inboxAgeAt(thread: SidebarThread, running: boolean): number {
  return running ? thread.createdAt : threadActivityAt(thread);
}

const MAX_BADGE_COUNT = 99;

export function formatBadgeCount(count: number): string {
  return count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(count);
}

export function describeInbox(needsYou: number, running: number): string {
  const waiting =
    needsYou === 1 ? "1 thread needs you" : `${needsYou} threads need you`;
  return `${waiting}, ${running} running`;
}

export function describePinned(count: number): string {
  return count === 1 ? "1 pinned thread" : `${count} pinned threads`;
}
