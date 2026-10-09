import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  experimental_useSidebarThreadActions,
  useBbContext,
  useSidebarThreadDraftIds,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useActiveProject } from "../model/use-active-project.js";
import type { SidebarThread } from "../model/sidebar-thread.js";
import { closeProjectPicker, useProjectPickerOpen } from "./picker-store.js";
import {
  buildLeftEntries,
  clampIndex,
  entryProjectId,
  threadRowsForEntry,
  unreadThreads,
  type LeftEntry,
  type PickerColumn,
  type ThreadRowModel,
} from "./picker-model.js";
import {
  keyName,
  PICKER_HINTS,
  resolveFilterKey,
  resolvePickerKey,
  resolvePreviewKey,
  type FilterCommand,
  type PickerCommand,
  type PreviewScroll,
} from "./picker-keymap.js";
import { usePinnedToBottom } from "./use-pinned-to-bottom.js";
import {
  describePathLookup,
  openableFolderPath,
  useFolderPathLookup,
} from "./use-folder-path-lookup.js";
import { useHostDialogOpen } from "./use-host-dialog-open.js";
import { useOpenFolder } from "./use-open-folder.js";
import {
  PreviewPane,
  scrollPreview,
  usePreviewThreadId,
} from "./PreviewPane.js";
import { ProjectsColumn } from "./ProjectsColumn.js";
import { ThreadsColumn } from "./ThreadsColumn.js";

/**
 * Opens on Unread with the left column focused, so the projects are one j
 * away. The routed thread is pre-highlighted when it is listed there.
 */
function initialSelection(
  routedThreadId: string | null,
  threads: readonly SidebarThread[],
): { leftKey: string; threadId: string | null } {
  return {
    leftKey: "unread",
    threadId: unreadThreads(threads).some(
      (thread) => thread.id === routedThreadId,
    )
      ? routedThreadId
      : null,
  };
}

function consume(event: ReactKeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function PickerHints() {
  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-border px-3 text-[11px] text-muted-foreground">
      {PICKER_HINTS.map(([keys, label]) => (
        <span key={label} className="flex items-center gap-1">
          <kbd className="rounded border border-border px-1 font-sans">
            {keys}
          </kbd>
          {label}
        </span>
      ))}
    </div>
  );
}

function ProjectPickerDialog() {
  const sidebarActions = experimental_useSidebarThreadActions();
  const { threadId: routedThreadId } = useBbContext();
  const draftIds = useSidebarThreadDraftIds();
  const {
    activeProjectId,
    orderedProjects,
    personalProjectId,
    resolveProjectId,
    setActiveProjectId,
    threads,
  } = useActiveProject();
  const [initial] = useState(() =>
    initialSelection(routedThreadId, threads),
  );
  const [column, setColumn] = useState<PickerColumn>("left");
  const [leftKey, setLeftKey] = useState(initial.leftKey);
  const [threadId, setThreadId] = useState<string | null>(initial.threadId);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const pendingKey = useRef<string | null>(null);
  const lastRight = useRef<{ threadId: string | null; index: number }>({
    threadId: null,
    index: 0,
  });

  const leftEntries = useMemo(
    () => buildLeftEntries({ orderedProjects, personalProjectId, query }),
    [orderedProjects, personalProjectId, query],
  );
  const unreadCount = useMemo(() => unreadThreads(threads).length, [threads]);
  const leftIndex = clampIndex(
    Math.max(
      0,
      leftEntries.findIndex((entry) => entry.key === leftKey),
    ),
    leftEntries.length,
  );
  const leftEntry: LeftEntry | undefined = leftEntries[leftIndex];
  const rows = useMemo(
    () => threadRowsForEntry({ entry: leftEntry, threads, resolveProjectId }),
    [leftEntry, resolveProjectId, threads],
  );
  const foundRightIndex = rows.findIndex((row) => row.thread.id === threadId);
  // A highlighted thread that disappears (deleted, archived) leaves the
  // cursor on the row that took its place instead of jumping to the top.
  const rightIndex = clampIndex(
    foundRightIndex >= 0
      ? foundRightIndex
      : threadId !== null && threadId === lastRight.current.threadId
        ? lastRight.current.index
        : 0,
    rows.length,
  );
  lastRight.current = { threadId, index: rightIndex };
  const highlightedRow: ThreadRowModel | undefined = rows[rightIndex];
  const previewThreadId = usePreviewThreadId(
    column === "left" ? null : (highlightedRow?.thread.id ?? null),
  );
  const releasePreviewPin = usePinnedToBottom(previewRef, previewThreadId);
  const behindHostDialog = useHostDialogOpen(rootRef);
  const scrollPreviewBy = (scroll: PreviewScroll) => {
    releasePreviewPin();
    scrollPreview(previewRef.current, scroll);
  };
  const pathQuery = leftEntry?.kind === "path" ? query.trim() : "";
  const pathLookup = useFolderPathLookup(pathQuery, pathQuery !== "");
  const { busy, openFolder, browseForFolder } = useOpenFolder((projectId) => {
    setActiveProjectId(projectId);
    setQuery("");
    setLeftKey(projectId);
    setThreadId(null);
    setColumn("left");
  });

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const selectLeft = (index: number) => {
    const entry = leftEntries[clampIndex(index, leftEntries.length)];
    if (entry === undefined || entry.key === leftKey) return;
    setLeftKey(entry.key);
    setThreadId(null);
  };
  const selectRight = (index: number) => {
    const row = rows[clampIndex(index, rows.length)];
    if (row) setThreadId(row.thread.id);
  };
  const moveBy = (delta: number) => {
    if (column === "preview") {
      scrollPreviewBy(delta > 0 ? "line-down" : "line-up");
    } else if (column === "left") selectLeft(leftIndex + delta);
    else selectRight(rightIndex + delta);
  };
  const moveTo = (edge: "first" | "last") => {
    if (column === "preview") {
      scrollPreviewBy(edge === "first" ? "top" : "bottom");
      return;
    }
    const length = column === "left" ? leftEntries.length : rows.length;
    const index = edge === "first" ? 0 : length - 1;
    if (column === "left") selectLeft(index);
    else selectRight(index);
  };
  const focusColumn = (next: PickerColumn) => {
    if (next !== "left" && rows.length === 0) return;
    setColumn(next);
    setSearching(false);
  };

  const openThread = (thread: SidebarThread) => {
    const projectId = resolveProjectId(thread);
    if (projectId !== personalProjectId) setActiveProjectId(projectId);
    closeProjectPicker();
    sidebarActions.open(thread.id);
  };

  /** The thread the row-level keys act on, unless the cursor is in projects. */
  const actionableRow = (): ThreadRowModel | undefined =>
    column === "left" ? undefined : highlightedRow;

  const togglePin = () => {
    const thread = actionableRow()?.thread;
    if (thread === undefined) return;
    void sidebarActions
      .setPinned(thread.id, thread.pinnedAt === null)
      .catch(() => toast.error("Failed to update the pin."));
  };

  const markRead = () => {
    const thread = actionableRow()?.thread;
    if (thread === undefined || !thread.isUnread) return;
    void sidebarActions
      .setRead(thread.id, true)
      .catch(() => toast.error("Failed to mark the thread read."));
  };

  const archiveThread = () => {
    const thread = actionableRow()?.thread;
    if (thread === undefined) return;
    sidebarActions.archive(thread.id);
  };

  const newThread = () => {
    const projectId = entryProjectId(leftEntry, activeProjectId);
    if (projectId === null) return;
    if (projectId !== personalProjectId) setActiveProjectId(projectId);
    closeProjectPicker();
    sidebarActions.openNewThread({ projectId, focusPrompt: true });
  };

  const activate = () => {
    if (busy) return;
    if (column !== "left") {
      if (highlightedRow) openThread(highlightedRow.thread);
      return;
    }
    switch (leftEntry?.kind) {
      case "browse":
        void browseForFolder();
        return;
      case "path": {
        const path = openableFolderPath(pathLookup);
        if (path !== null) void openFolder(path);
        return;
      }
      case undefined:
        return;
      default:
        focusColumn("right");
    }
  };

  const startSearch = () => {
    setSearching(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const stopSearch = () => {
    setSearching(false);
    rootRef.current?.focus();
  };

  const pickerCommands: Record<PickerCommand, () => void> = {
    down: () => moveBy(1),
    up: () => moveBy(-1),
    left: () => focusColumn(column === "preview" ? "right" : "left"),
    right: () => focusColumn(column === "left" ? "right" : "preview"),
    "switch-column": () => focusColumn(column === "left" ? "right" : "left"),
    top: () => moveTo("first"),
    bottom: () => moveTo("last"),
    activate,
    pin: togglePin,
    "mark-read": markRead,
    archive: archiveThread,
    "new-thread": newThread,
    filter: startSearch,
    escape: () => {
      if (query !== "") {
        setQuery("");
        setColumn("left");
      } else closeProjectPicker();
    },
    close: closeProjectPicker,
  };

  const filterCommands: Record<FilterCommand, () => void> = {
    down: () => moveBy(1),
    up: () => moveBy(-1),
    accept: () => {
      stopSearch();
      activate();
    },
    cancel: stopSearch,
  };

  const onRootKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target === inputRef.current) return;
    if (event.metaKey || event.altKey) return;
    const key = keyName(event);
    // Every key, Shift included, ends a pending double tap.
    const previousPendingKey = pendingKey.current;
    pendingKey.current = null;
    const previewScroll =
      column === "preview" ? resolvePreviewKey(key) : undefined;
    if (previewScroll !== undefined) {
      scrollPreviewBy(previewScroll);
      consume(event);
      return;
    }
    const resolved = resolvePickerKey(key, previousPendingKey);
    if (resolved.type === "unbound") return;
    if (resolved.type === "pending") pendingKey.current = key;
    else pickerCommands[resolved.command]();
    consume(event);
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const command = resolveFilterKey(keyName(event));
    if (command === undefined) return;
    filterCommands[command]();
    consume(event);
  };

  return (
    <div
      className={cn("fixed inset-0", behindHostDialog ? "z-40" : "z-[60]")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeProjectPicker();
      }}
    >
      <div
        ref={rootRef}
        role="dialog"
        aria-label="Switch project"
        tabIndex={-1}
        data-vim-ignore=""
        onKeyDown={onRootKeyDown}
        className="absolute left-1/2 top-[10vh] flex h-[min(680px,84vh)] w-[min(1240px,96vw)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none"
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <Icon name="Search" className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            readOnly={!searching}
            tabIndex={-1}
            onFocus={() => setSearching(true)}
            onBlur={() => setSearching(false)}
            onChange={(event) => {
              setQuery(event.target.value);
              setThreadId(null);
              setColumn("left");
            }}
            onKeyDown={onInputKeyDown}
            placeholder="/ to filter projects, or type a folder path"
            aria-label="Filter projects"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            spellCheck={false}
            autoComplete="off"
          />
          {busy ? (
            <Icon
              name="Loading"
              className="size-4 animate-spin text-muted-foreground"
            />
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1">
          <ProjectsColumn
            entries={leftEntries}
            selectedIndex={leftIndex}
            focused={column === "left"}
            activeProjectId={activeProjectId}
            draftIds={draftIds}
            unreadCount={unreadCount}
            onEntryClick={(index, entry) => {
              selectLeft(index);
              setColumn("left");
              if (entry.kind === "browse") void browseForFolder();
            }}
          />
          <ThreadsColumn
            entry={leftEntry}
            rows={rows}
            highlightedIndex={rightIndex}
            column={column}
            status={
              leftEntry?.kind === "path"
                ? describePathLookup(pathLookup, pathQuery)
                : null
            }
            narrow={previewThreadId !== null}
            routedThreadId={routedThreadId}
            orderedProjects={orderedProjects}
            resolveProjectId={resolveProjectId}
            draftIds={draftIds}
            onHover={(hoveredThreadId) => {
              setThreadId(hoveredThreadId);
              setColumn("right");
            }}
            onOpen={openThread}
          />
          {previewThreadId === null ? null : (
            <PreviewPane
              containerRef={previewRef}
              threadId={previewThreadId}
              focused={column === "preview"}
              onFocus={() => setColumn("preview")}
            />
          )}
        </div>
        <PickerHints />
      </div>
    </div>
  );
}

export function ProjectPicker() {
  const open = useProjectPickerOpen();
  return open ? <ProjectPickerDialog /> : null;
}
