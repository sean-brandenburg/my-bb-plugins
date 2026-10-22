import { useState } from "react";
import type { ReactNode } from "react";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import { enter, usePopOnChange, POPOVER_MOTION } from "bb-motion";
import { DiffRefreshButton } from "bb-diff-view/app/diff-view";
import type { rpcContract } from "../contract";
import type { Board } from "../shared/board";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { relativeTime } from "./format";
import { useBoard, useNow } from "./data";
import { pageUi, usePageUi } from "./page-state";
import { Badge, COMPACT, KANBAN_MENU, MENU_ITEM_CLASS, SegmentedTabs, menuVimKeys } from "./primitives";
import { diffInstanceKey, diffSubjectFromSubPath } from "./diff-page";
import { toastError } from "./actions";

function syncSummary(board: Board, now: number): string {
  const { sync } = board;
  if (sync.lastSyncAt === null) return "Not synced yet";
  const prCount = board.tickets.filter((ticket) => ticket.kind === "pr").length;
  const jiraCount = board.tickets.filter((ticket) => ticket.kind === "jira").length;
  const parts = [`${prCount} PR${prCount === 1 ? "" : "s"}${sync.login !== null ? ` as @${sync.login}` : ""}`];
  if (jiraCount > 0) parts.push(`${jiraCount} Jira`);
  return `${parts.join(" · ")} · synced ${relativeTime(sync.lastSyncAt, now)}`;
}

function BoardSettingsMenu({
  board,
  syncing,
  onColumns,
  onSources,
  onShortcuts,
  onSync,
}: {
  board: Board | null;
  syncing: boolean;
  onColumns: () => void;
  onSources: () => void;
  onShortcuts: () => void;
  onSync: () => void;
}) {
  const now = useNow();
  const { showSubtasks } = usePageUi();
  const error = board?.sync.lastError ?? null;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" className="relative size-7" aria-label="Board settings">
          <Icon name="Settings" className={cn("size-4", syncing && "animate-spin")} />
          {error !== null ? (
            <span aria-hidden className={cn("absolute right-1 top-1 size-1.5 rounded-full bg-destructive", enter.pop)} />
          ) : null}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          {...usePortalScopeProps()}
          align="end"
          sideOffset={4}
          className={cn("z-50 min-w-56 max-w-80 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md", POPOVER_MOTION, KANBAN_MENU)}
          onKeyDown={menuVimKeys}
        >
          <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={onColumns}>
            <Icon name="Columns2" className="size-4 text-muted-foreground" />
            Columns…
          </DropdownMenu.Item>
          <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={onSources}>
            <Icon name="kanban-rss" className="size-4 text-muted-foreground" />
            Sources…
          </DropdownMenu.Item>
          <DropdownMenu.CheckboxItem
            className={cn(MENU_ITEM_CLASS, "pl-7")}
            checked={showSubtasks}
            onCheckedChange={(checked) => pageUi.set({ showSubtasks: checked === true })}
            onSelect={(event) => event.preventDefault()}
          >
            <DropdownMenu.ItemIndicator className="absolute left-2">
              <Icon name="Check" className={cn("size-4", enter.pop)} />
            </DropdownMenu.ItemIndicator>
            Show subtasks on the board
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={onShortcuts}>
            <Icon name="kanban-keyboard" className="size-4 text-muted-foreground" />
            Keyboard shortcuts
            <kbd className="ml-auto font-mono text-xs text-muted-foreground">?</kbd>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item className={cn(MENU_ITEM_CLASS, "items-start")} disabled={syncing} onSelect={onSync}>
            <Icon name="kanban-refresh" className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground", syncing && "animate-spin")} />
            <span className="flex min-w-0 flex-col">
              <span>{syncing ? "Syncing sources…" : "Sync sources now"}</span>
              {board !== null ? (
                <span className={cn("truncate text-xs", error !== null ? "text-destructive" : "text-muted-foreground")} title={error ?? undefined}>
                  {error ?? syncSummary(board, now)}
                </span>
              ) : null}
            </span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * The way back from a sub-page, as a trail: the parent page is a button, the current page plain
 * text. The host puts the header on the right of the title bar; on narrow screens only the parent
 * shows, so it carries a back chevron there.
 */
function Trail({ parent, onParent, children }: { parent: string; onParent: () => void; children: ReactNode }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center text-xs">
      <Button type="button" variant="ghost" className={cn(COMPACT, "px-1.5 text-muted-foreground hover:text-foreground")} onClick={onParent}>
        <Icon name="ChevronLeft" className="size-3.5 md:hidden" />
        {parent}
      </Button>
      <span className="hidden min-w-0 items-center md:inline-flex">
        <Icon name="ChevronRight" className="size-3.5 shrink-0 text-muted-foreground/60" />
        {children}
      </span>
    </nav>
  );
}

/** Controls for the host title bar: board tools on the board, diff tools on a card's changes page. */
export function BoardHeader({ subPath }: { subPath: string }) {
  const trimmed = subPath.replace(/^\/+|\/+$/gu, "");
  const diffTicketId = diffSubjectFromSubPath(trimmed);
  const view: "board" | "todo" = trimmed === "todo" ? "todo" : "board";
  const navigate = useBbNavigate();
  const rpc = useRpc<typeof rpcContract>();
  const { board, refetch } = useBoard();
  const [syncing, setSyncing] = useState(false);
  const syncNow = async () => {
    setSyncing(true);
    try {
      const status = await rpc.call("sync_now");
      if (status.lastError !== null) toast.error(status.lastError);
    } catch (cause) {
      toastError(cause);
    } finally {
      setSyncing(false);
      refetch();
    }
  };

  const onProposals = trimmed === "proposals" || trimmed.startsWith("proposals/");
  if (onProposals) {
    const atList = trimmed === "proposals";
    return (
      <div className="flex min-w-0 items-center gap-2">
        <Trail parent={atList ? "Board" : "Proposals"} onParent={() => navigate.toPluginPanel("board", { subPath: atList ? "" : "proposals" })}>
          <span className="px-1 text-muted-foreground">{atList ? "Proposals" : "Proposal"}</span>
        </Trail>
        <Button className={COMPACT} onClick={() => pageUi.set({ dialog: "new", newTicketColumn: null })}>
          <Icon name="Plus" className="size-3.5" />
          New card
        </Button>
      </div>
    );
  }
  if (diffTicketId !== null) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <Button type="button" variant="ghost" className={cn(COMPACT, "px-1.5 text-muted-foreground hover:text-foreground")} onClick={() => navigate.toPluginPanel("board", { subPath: "" })}>
          <Icon name="ChevronLeft" className="size-3.5" />
          Board
        </Button>
        <DiffRefreshButton instanceKey={diffInstanceKey(diffTicketId)} />
      </div>
    );
  }

  return (
    <div data-kanban-keys="" data-kanban-header="" className="flex items-center gap-1.5">
      <SegmentedTabs
        label="View"
        value={view}
        options={VIEW_OPTIONS}
        onChange={(entry) => navigate.toPluginPanel("board", { subPath: entry === "board" ? "" : "todo" })}
        tabClassName="px-2 py-0.5"
      />
      <BoardSettingsMenu
        board={board}
        syncing={syncing || board?.sync.inProgress === true}
        onColumns={() => pageUi.set({ dialog: "columns" })}
        onSources={() => pageUi.set({ dialog: "sources" })}
        onShortcuts={() => pageUi.set({ dialog: "keys" })}
        onSync={() => void syncNow()}
      />
      {board !== null && board.dumps.length > 0 ? <ProposalsButton board={board} onOpen={() => navigate.toPluginPanel("board", { subPath: "proposals" })} /> : null}
      <Button className={COMPACT} onClick={() => pageUi.set({ dialog: "new", newTicketColumn: null })}>
        <Icon name="Plus" className="size-3.5" />
        New card
      </Button>
    </div>
  );
}

const VIEW_OPTIONS = [
  { value: "board", label: "Board" },
  { value: "todo", label: "Todo" },
] as const;

function ProposalsButton({ board, onOpen }: { board: Board; onOpen: () => void }) {
  const ready = board.dumps.filter((dump) => dump.status === "ready").length;
  const pop = usePopOnChange(ready);
  return (
    <Button type="button" variant="ghost" className={cn(COMPACT, "relative")} onClick={onOpen} aria-label="Brain dump proposals">
      <Icon name="kanban-search-check" className={cn("size-3.5", board.dumps.some((dump) => dump.status === "planning") && "animate-pulse")} />
      Proposals
      {ready > 0 ? (
        <span key={pop.key} onAnimationEnd={pop.onAnimationEnd} className={cn("inline-flex", pop.className)}>
          <Badge tone="success">{ready}</Badge>
        </span>
      ) : board.dumps.some((dump) => dump.status === "failed") ? (
        <Badge tone="danger" className={enter.pop}>!</Badge>
      ) : null}
    </Button>
  );
}
