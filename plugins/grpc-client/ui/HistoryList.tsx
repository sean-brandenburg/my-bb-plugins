import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { toast } from "sonner";
import { cx, enter, PRESS, REVEAL, REVEAL_HOST, speed, EntranceScope, usePresenceList } from "bb-motion";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { HistoryEntry, rpcContract } from "../server/rpc-contract";
import { CHANGED_CHANNEL, errorMessage } from "../shared/common";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { focusRow, NAV_ROW } from "./client-keys";
import { FOCUS_RING } from "./controls";
import { matchesQuery } from "./filter";
import { PresenceRow } from "./presence";

const HISTORY_LIST_LIMIT = 200;

function formatWhen(at: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString() ? time : `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

/** What a search matches a call against: the request too, so a call can be found by an ID it sent. */
function searchText(entry: HistoryEntry): string {
  return `${entry.method} ${entry.endpoint} ${entry.status} ${entry.message} ${entry.origin} ${entry.request}`;
}

export interface HistoryListHandle {
  /** False while the list has no search box yet (it is loading, or empty). */
  focusSearch: () => boolean;
  /** Clears the search; false when there was none. */
  clearSearch: () => boolean;
}

export function HistoryList({
  selectedId,
  handle,
  onOpen,
}: {
  selectedId: number | null;
  handle: RefObject<HistoryListHandle | null>;
  onOpen: (entry: HistoryEntry) => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(handle, () => ({
    focusSearch: () => {
      // Like vim's /, typing starts a new search instead of extending the last one.
      searchRef.current?.select();
      return searchRef.current !== null;
    },
    clearSearch: () => {
      if (query === "") return false;
      setQuery("");
      return true;
    },
  }));
  const [confirmClear, setConfirmClear] = useState(false);
  const header = useRef<HTMLDivElement>(null);
  // Clear and its confirmation swap places, so a cursor on one moves to the other.
  const headerFocused = useRef(false);
  const toggleConfirm = (next: boolean) => {
    headerFocused.current = header.current?.contains(document.activeElement) ?? false;
    setConfirmClear(next);
  };
  useLayoutEffect(() => {
    if (!headerFocused.current) return;
    headerFocused.current = false;
    header.current?.querySelector<HTMLButtonElement>(confirmClear ? "[data-history-cancel]" : "button")?.focus({ preventScroll: true });
  }, [confirmClear]);
  const refetch = useCallback(() => {
    rpc.call("history", { limit: HISTORY_LIST_LIMIT }).then(
      (result) => setEntries(result.entries),
      () => setEntries([]),
    );
  }, [rpc]);
  useEffect(refetch, [refetch]);
  useRealtime(CHANGED_CHANNEL, refetch);
  const remove = (id: number) => {
    setEntries((current) => current?.filter((entry) => entry.id !== id) ?? null);
    rpc.call("deleteHistory", { ids: [id] }).then(refetch, (cause) => {
      toast.error(errorMessage(cause));
      refetch();
    });
  };
  const presence = usePresenceList(entries ?? [], (entry) => String(entry.id));
  if (entries === null) return <p className="p-4 text-sm text-muted-foreground" data-nav-loading="">Loading…</p>;
  if (presence.entries.length === 0) return <p className={cx("p-4 text-sm text-muted-foreground", enter.fade)}>Calls you make here or with `bb grpc call` appear here.</p>;
  // Calls the search hides just go; only deleted ones play their exit.
  const shown = query === "" ? presence.entries : presence.entries.filter(({ item, exiting }) => exiting || matchesQuery(searchText(item), query));
  const callRows = () => [...(listRef.current?.querySelectorAll<HTMLElement>(`${NAV_ROW}[data-nav-key^="history:"]`) ?? [])];
  return (
    <EntranceScope>
      <div className="px-2 pt-2">
        <div className="relative">
          <Icon name="Search" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-7 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            placeholder={`Search ${entries.length} calls`}
            value={query}
            spellCheck={false}
            // A filter box, like a palette's: vim editing would take its Escape and arrows.
            data-vim-ignore=""
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              const rows = callRows();
              if (event.key === "Escape") {
                event.preventDefault();
                if (query !== "") setQuery("");
                else {
                  const cursor = rows.find((row) => row.getAttribute("aria-current") === "true") ?? rows[0];
                  if (cursor) focusRow(cursor);
                }
              }
              if (event.key === "ArrowDown" && rows[0]) {
                event.preventDefault();
                focusRow(rows[0]);
              }
              const first = shown.find(({ exiting }) => !exiting)?.item;
              if (event.key === "Enter" && first !== undefined) {
                onOpen(first);
                // Leaves the search with the cursor on the match, so j/k carry on through the rest.
                if (rows[0]) focusRow(rows[0]);
              }
            }}
          />
          {query !== "" ? (
            <button
              type="button"
              className={cx("absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground", enter.fade, speed.fast, PRESS)}
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <Icon name="X" className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div ref={header} className="flex items-center justify-between px-2 pb-1" data-nav-row="toolbar">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recent calls</p>
          {confirmClear ? (
            <span className={cx("flex items-center gap-1 text-xs", enter.fade, speed.fast)}>
              <button
                type="button"
                className={cx("rounded px-1.5 py-0.5 text-destructive hover:bg-destructive/10", PRESS, FOCUS_RING)}
                onClick={() => {
                  toggleConfirm(false);
                  rpc.call("clearHistory").then(refetch, (cause) => toast.error(errorMessage(cause)));
                }}
              >
                Delete all
              </button>
              <button
                type="button"
                className={cx("rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground", PRESS, FOCUS_RING)}
                data-history-cancel=""
                onClick={() => toggleConfirm(false)}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className={cx("rounded text-xs text-muted-foreground hover:text-foreground", enter.fade, speed.fast, PRESS, FOCUS_RING)}
              onClick={() => toggleConfirm(true)}
            >
              Clear
            </button>
          )}
        </div>
        {shown.length === 0 ? <p className="px-2 py-6 text-center text-sm text-muted-foreground">No calls match “{query}”.</p> : null}
        {shown.map(({ key, item: entry, exiting }, index) => (
          <PresenceRow
            key={key}
            className={cn("flex items-start rounded-md hover:bg-state-hover", REVEAL_HOST, entry.id === selectedId && "bg-state-active")}
            cascadeIndex={index}
            exiting={exiting}
            onExited={() => presence.onExited(key)}
          >
            <button
              type="button"
              className={cn("flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-2 py-2 text-left", FOCUS_RING)}
              title={entry.message || entry.method}
              aria-current={entry.id === selectedId ? "true" : undefined}
              data-nav-row={exiting ? undefined : "item"}
              data-nav-key={`history:${entry.id}`}
              onClick={() => onOpen(entry)}
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <span className={cn("size-2 shrink-0 rounded-full", entry.ok ? "bg-emerald-500" : "bg-destructive")} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-foreground">{entry.method.slice(entry.method.lastIndexOf("/") + 1)}</span>
                <span className={cn("shrink-0 text-xs", entry.ok ? "text-muted-foreground" : "text-destructive")}>{entry.status}</span>
              </span>
              <span className="truncate pl-4 text-xs text-muted-foreground">
                {entry.endpoint} · {formatWhen(entry.at)} · {entry.durationMs} ms
                {entry.origin === "cli" ? " · CLI" : ""}
              </span>
            </button>
            <button
              type="button"
              className={cx("mr-1 mt-2 shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground", REVEAL)}
              aria-label={`Delete ${entry.method} from history`}
              data-history-delete=""
              title="Delete from history"
              onClick={() => remove(entry.id)}
            >
              <Icon name="Trash2" className="size-3.5" />
            </button>
          </PresenceRow>
        ))}
      </div>
    </EntranceScope>
  );
}
