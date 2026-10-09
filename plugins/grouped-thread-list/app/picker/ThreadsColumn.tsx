import { useEffect, useRef } from "react";
import { enter, PRESS, speed, STAGGER, stagger, useChangedSinceMount, SOFT } from "bb-motion";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { threadListIndicatorStateForThread } from "../model/thread-activity.js";
import type { SidebarProjectIdResolver } from "../model/active-project.js";
import type { SidebarThread } from "../model/sidebar-thread.js";
import type { SidebarProject } from "../model/use-sidebar-data.js";
import { ThreadStatusGlyph } from "../rows/ThreadStatusGlyph.js";
import { ProjectMonogram } from "../rows/ProjectMonogram.js";
import {
  formatAge,
  type LeftEntry,
  type PickerColumn,
  type ThreadRowModel,
} from "./picker-model.js";

function emptyMessage(entry: LeftEntry | undefined): string {
  if (entry === undefined) return "No matching projects.";
  switch (entry.kind) {
    case "browse":
      return "Enter opens the folder picker.";
    case "unread":
      return "No unread or running threads.";
    default:
      return "No threads. Press n to start one.";
  }
}

/** Entries that mix projects get a monogram on each row. */
function showsProjectMonograms(entry: LeftEntry | undefined): boolean {
  return entry?.kind === "pinned" || entry?.kind === "unread";
}

/** Pops when the row is pinned in view, not when it mounts already pinned. */
function PinnedMark({ pinned }: { pinned: boolean }) {
  const changed = useChangedSinceMount(pinned);
  if (!pinned) return null;
  return (
    <Icon
      name="Pin"
      className={cn(
        "size-3 shrink-0 text-muted-foreground",
        changed && enter.pop,
      )}
      aria-label="Pinned"
    />
  );
}

const MESSAGE_CLASS = "px-3 py-2 text-sm text-muted-foreground";

/** The right column: the selected entry's threads, or a status line. */
export function ThreadsColumn({
  entry,
  rows,
  intro,
  highlightedIndex,
  column,
  status,
  narrow,
  routedThreadId,
  orderedProjects,
  resolveProjectId,
  draftIds,
  onHover,
  onOpen,
}: {
  entry: LeftEntry | undefined;
  rows: readonly ThreadRowModel[];
  /** The picker just opened: rows cascade in. */
  intro: boolean;
  highlightedIndex: number;
  column: PickerColumn;
  /** Replaces the rows, e.g. the typed folder path's lookup result. */
  status: string | null;
  /** Leaves room for the preview pane beside it. */
  narrow: boolean;
  routedThreadId: string | null;
  orderedProjects: readonly SidebarProject[];
  resolveProjectId: SidebarProjectIdResolver;
  draftIds: ReadonlySet<string>;
  onHover: (threadId: string) => void;
  onOpen: (thread: SidebarThread) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-picker-index="${highlightedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const now = Date.now();
  const withMonograms = showsProjectMonograms(entry);
  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={entry ? `${entry.label} threads` : "Threads"}
      data-picker-column="right"
      className={cn(
        "overflow-y-auto p-1",
        narrow ? "w-80 shrink-0" : "min-w-0 flex-1",
      )}
    >
      {status !== null ? (
        <div className={cn(MESSAGE_CLASS, enter.fade, speed.fast)}>
          {status}
        </div>
      ) : rows.length === 0 ? (
        <div className={cn(MESSAGE_CLASS, enter.fade, speed.fast)}>
          {emptyMessage(entry)}
        </div>
      ) : (
        rows.map((row, index) => {
          // The remembered row stays unpainted while the cursor is in the
          // projects column, so only one column shows a cursor.
          const selected = index === highlightedIndex && column !== "left";
          const project = withMonograms
            ? orderedProjects.find(
                (candidate) => candidate.id === resolveProjectId(row.thread),
              )
            : undefined;
          return (
            <div
              key={row.thread.id}
              role="option"
              aria-selected={selected}
              data-picker-index={index}
              data-picker-thread-id={row.thread.id}
              className={cn(
                "flex h-8 cursor-pointer select-none items-center gap-2 rounded-md pr-2 text-sm",
                PRESS,
                SOFT,
                intro && [enter.rise, speed.fast, STAGGER],
                selected &&
                  (column === "right"
                    ? "bg-state-active text-foreground"
                    : "bg-state-hover"),
                row.thread.id === routedThreadId && "font-medium",
              )}
              style={{
                paddingLeft: 8 + row.depth * 16,
                ...(intro ? stagger(index) : undefined),
              }}
              onMouseMove={() => {
                if (!selected || column !== "right") onHover(row.thread.id);
              }}
              onClick={() => onOpen(row.thread)}
            >
              <span className="flex size-4 shrink-0 items-center justify-center">
                <ThreadStatusGlyph
                  {...threadListIndicatorStateForThread(
                    row.thread,
                    draftIds.has(row.thread.id),
                  )}
                />
              </span>
              {project ? (
                <ProjectMonogram projectId={project.id} name={project.name} />
              ) : null}
              <span className="min-w-0 flex-1 truncate">
                {row.thread.displayTitle}
              </span>
              <PinnedMark pinned={row.thread.pinnedAt !== null} />
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatAge(row.thread.updatedAt, now)}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
