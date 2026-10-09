import type { SidebarThread } from "../model/sidebar-thread.js";
import type { SidebarProject } from "../model/use-sidebar-data.js";
import {
  buildThreadTree,
  compareStandardThreads,
  isSidebarProjectThread,
  type ProjectThreadNode,
} from "../model/project-thread-groups.js";
import { buildPinnedThreadTree } from "../model/pinned-sidebar-threads.js";
import { isUnreadDoneThread } from "../model/thread-activity.js";
import type { SidebarProjectIdResolver } from "../model/active-project.js";

export type PickerColumn = "left" | "right" | "preview";

export type LeftEntry =
  | { kind: "pinned"; key: "pinned"; label: string }
  | { kind: "personal"; key: "personal"; label: string; projectId: string }
  | { kind: "unread"; key: "unread"; label: string }
  | { kind: "project"; key: string; label: string; project: SidebarProject }
  | { kind: "path"; key: "path"; label: string }
  | { kind: "browse"; key: "browse"; label: string };

export interface ThreadRowModel {
  thread: SidebarThread;
  depth: number;
}

export function looksLikePath(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.startsWith("/") || trimmed === "~" || trimmed.startsWith("~/");
}

/** Subsequence match, so "mbp" finds "my-bb-plugins". */
export function fuzzyMatches(text: string, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return true;
  const haystack = text.toLocaleLowerCase();
  let index = 0;
  for (const char of needle) {
    index = haystack.indexOf(char, index);
    if (index === -1) return false;
    index += 1;
  }
  return true;
}

export function buildLeftEntries({
  orderedProjects,
  personalProjectId,
  query,
}: {
  orderedProjects: readonly SidebarProject[];
  personalProjectId: string | null;
  query: string;
}): LeftEntry[] {
  if (looksLikePath(query)) {
    return [
      { kind: "path", key: "path", label: query.trim() },
      { kind: "browse", key: "browse", label: "Open folder…" },
    ];
  }
  const entries: LeftEntry[] = [];
  const filtering = query.trim() !== "";
  if (!filtering) {
    entries.push({ kind: "browse", key: "browse", label: "Open folder…" });
    if (personalProjectId !== null) {
      entries.push({
        kind: "personal",
        key: "personal",
        label: "Unassociated",
        projectId: personalProjectId,
      });
    }
    entries.push({ kind: "pinned", key: "pinned", label: "Pinned" });
    entries.push({ kind: "unread", key: "unread", label: "Unread" });
  }
  for (const project of orderedProjects) {
    if (!fuzzyMatches(project.name, query)) continue;
    entries.push({
      kind: "project",
      key: project.id,
      label: project.name,
      project,
    });
  }
  return entries;
}

function flattenNodes(
  nodes: readonly ProjectThreadNode[],
  depth: number,
  rows: ThreadRowModel[],
) {
  for (const node of nodes) {
    rows.push({ thread: node.thread, depth });
    flattenNodes(node.children, depth + 1, rows);
  }
}

function flattenThreadTree(
  nodes: readonly ProjectThreadNode[],
): ThreadRowModel[] {
  const rows: ThreadRowModel[] = [];
  flattenNodes(nodes, 0, rows);
  return rows;
}

const CLAUDE_CODE_PROVIDER_ID = "claude-code";
const AUTOMATIONS_PLUGIN_ID = "automations";

function isRunningClaudeThread(thread: SidebarThread): boolean {
  return (
    thread.parentThreadId == null &&
    thread.providerId === CLAUDE_CODE_PROVIDER_ID &&
    (thread.status === "active" || thread.status === "starting")
  );
}

/**
 * Root threads only, matching the unread dot the glyphs already show. Running
 * Claude sessions are listed too so the tab doubles as "what needs me soon".
 * Automation runs are left out so scheduled work doesn't crowd the list.
 */
export function unreadThreads(
  threads: readonly SidebarThread[],
): SidebarThread[] {
  return threads
    .filter(
      (thread) =>
        isSidebarProjectThread(thread) &&
        thread.originPluginId !== AUTOMATIONS_PLUGIN_ID &&
        (isUnreadDoneThread(thread) || isRunningClaudeThread(thread)),
    )
    .sort(compareStandardThreads);
}

export function threadRowsForEntry({
  entry,
  threads,
  resolveProjectId,
}: {
  entry: LeftEntry | undefined;
  threads: readonly SidebarThread[];
  resolveProjectId: SidebarProjectIdResolver;
}): ThreadRowModel[] {
  if (entry === undefined) return [];
  const visible = threads.filter(isSidebarProjectThread);
  const projectRows = (projectId: string) =>
    flattenThreadTree(
      buildThreadTree(
        visible.filter((thread) => resolveProjectId(thread) === projectId),
      ),
    );
  switch (entry.kind) {
    case "pinned":
      return flattenThreadTree(buildPinnedThreadTree(visible));
    case "unread":
      return unreadThreads(visible).map((thread) => ({ thread, depth: 0 }));
    case "personal":
      return projectRows(entry.projectId);
    case "project":
      return projectRows(entry.project.id);
    case "path":
    case "browse":
      return [];
  }
}

/** The project `n` starts a thread in, or the active one for other entries. */
export function entryProjectId(
  entry: LeftEntry | undefined,
  activeProjectId: string | null,
): string | null {
  switch (entry?.kind) {
    case "project":
      return entry.project.id;
    case "personal":
      return entry.projectId;
    default:
      return activeProjectId;
  }
}

export function formatAge(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}

export function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}
