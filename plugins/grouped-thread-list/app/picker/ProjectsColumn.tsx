import { Fragment, useEffect, useRef } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  getCollapsedChildActivity,
  type ThreadListIndicatorState,
} from "../model/thread-activity.js";
import { isSidebarProjectThread } from "../model/project-thread-groups.js";
import type { SidebarThread } from "../model/sidebar-thread.js";
import { ThreadStatusGlyph } from "../rows/ThreadStatusGlyph.js";
import { ProjectMonogram } from "../rows/ProjectMonogram.js";
import type { LeftEntry } from "./picker-model.js";

const ENTRY_ICONS: Record<Exclude<LeftEntry["kind"], "project">, IconName> = {
  browse: "FolderPlus",
  path: "Folder",
  personal: "UserRound",
  pinned: "Pin",
  unread: "Mail",
};

function activityState(
  threads: readonly SidebarThread[],
  draftIds: ReadonlySet<string>,
): ThreadListIndicatorState {
  const activity = getCollapsedChildActivity(threads);
  return {
    hasPendingInteraction: activity.pending,
    hasUnsubmittedDraft: threads.some((thread) => draftIds.has(thread.id)),
    hasUnreadError: activity.unreadError,
    hasUnreadSuccess: activity.unread,
    isBackgroundAgentActive: activity.backgroundAgent,
    isBackgroundCommandActive: activity.backgroundCommand,
    isGoalActive: activity.goal,
    queuedWork: "none",
    isPlanModeActive: activity.planMode,
    isRuntimeActive: activity.runtimeWorking,
    isWorkflowActive: activity.workflow,
  };
}

function EntryTrailing({
  entry,
  activeProjectId,
  draftIds,
  unreadCount,
}: {
  entry: LeftEntry;
  activeProjectId: string | null;
  draftIds: ReadonlySet<string>;
  unreadCount: number;
}) {
  if (entry.kind === "project") {
    return (
      <span className="flex shrink-0 items-center gap-1">
        <ThreadStatusGlyph
          {...activityState(
            entry.project.threads.filter(isSidebarProjectThread),
            draftIds,
          )}
        />
        {entry.project.id === activeProjectId ? (
          <span
            className="size-1.5 rounded-full bg-foreground/60"
            aria-label="Active project"
          />
        ) : null}
      </span>
    );
  }
  if (entry.kind === "unread" && unreadCount > 0) {
    return (
      <span
        aria-hidden="true"
        className="shrink-0 text-xs tabular-nums text-muted-foreground"
      >
        {unreadCount}
      </span>
    );
  }
  return null;
}

/** The left column: the fixed entries, a divider, then the projects. */
export function ProjectsColumn({
  entries,
  selectedIndex,
  focused,
  activeProjectId,
  draftIds,
  unreadCount,
  onEntryClick,
}: {
  entries: readonly LeftEntry[];
  selectedIndex: number;
  focused: boolean;
  activeProjectId: string | null;
  draftIds: ReadonlySet<string>;
  unreadCount: number;
  onEntryClick: (index: number, entry: LeftEntry) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-picker-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Projects"
      data-picker-column="left"
      className={cn(
        "w-60 shrink-0 overflow-y-auto border-r border-border p-1",
        focused ? "bg-transparent" : "bg-muted/20",
      )}
    >
      {entries.map((entry, index) => {
        const selected = index === selectedIndex;
        const startsProjects =
          entry.kind === "project" &&
          index > 0 &&
          entries[index - 1]?.kind !== "project";
        return (
          <Fragment key={entry.key}>
            {startsProjects ? (
              <div
                aria-hidden="true"
                className="mx-2 my-1 border-t border-border"
              />
            ) : null}
            <div
              role="option"
              aria-selected={selected}
              data-picker-index={index}
              className={cn(
                "flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2 text-sm",
                selected &&
                  (focused
                    ? "bg-state-active text-foreground"
                    : "bg-state-hover"),
              )}
              onClick={() => onEntryClick(index, entry)}
            >
              <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                {entry.kind === "project" ? (
                  <ProjectMonogram
                    projectId={entry.project.id}
                    name={entry.project.name}
                  />
                ) : (
                  <Icon name={ENTRY_ICONS[entry.kind]} className="size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              <EntryTrailing
                entry={entry}
                activeProjectId={activeProjectId}
                draftIds={draftIds}
                unreadCount={unreadCount}
              />
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
