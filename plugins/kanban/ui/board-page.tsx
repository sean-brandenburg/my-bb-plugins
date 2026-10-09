import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useBbNavigate, experimental_useAppPanel as useAppPanel } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { SHIMMER, enter, speed, useArrivals } from "bb-motion";
import type { Ticket } from "../shared/board";
import { doneColumnId } from "../shared/columns";
import { cn } from "@/lib/utils";
import { useBoard, useProjects, useThreadIndex, useOpenThread, useNow } from "./data";
import { localDay } from "./format";
import { pageUi, usePageUi, TICKET_TAB } from "./page-state";
import { KanbanDiffView, diffSubjectFromSubPath } from "./diff-page";
import { type DropTarget, ColumnView } from "./column";
import { NewTicketDialog } from "./new-ticket-dialog";
import { TicketDialog } from "./ticket-details";
import { ColumnsDialog } from "./columns-dialog";
import { SourcesDialog } from "./sources-dialog";
import { TodoView } from "./todo-view";
import { ProposalsList, ProposalView } from "./proposals";
import { toastError } from "./actions";
import { type BoardCommand, cursorAfter, movePlacement, placementIndex } from "./board-nav";
import { useBoardKeys } from "./board-keys";
import { BoardKeysDialog } from "./board-keys-dialog";

export function BoardPage({ subPath }: { subPath: string }) {
  const trimmed = subPath.replace(/^\/+|\/+$/gu, "");
  const diffTicketId = diffSubjectFromSubPath(trimmed);
  const proposalId = trimmed.startsWith("proposals/") ? trimmed.slice("proposals/".length) : null;
  const proposalsList = trimmed === "proposals";
  const view: "board" | "todo" = trimmed === "todo" ? "todo" : "board";
  const navigate = useBbNavigate();
  const { rpc, board, setBoard, error, refetch } = useBoard();
  const projects = useProjects();
  const threads = useThreadIndex();
  const openThread = useOpenThread();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const { dialog, newTicketColumn, showSubtasks } = usePageUi();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The card just dropped, which settles with a pop wherever it landed.
  const [settledId, setSettledId] = useState<string | null>(null);
  const columnArrival = useArrivals(board === null ? null : board.columns.map((column) => column.id));
  const ticketArrival = useArrivals(board === null ? null : board.tickets.map((ticket) => ticket.id));

  const ticketsByColumn = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const ticket of board?.tickets ?? []) {
      if (!showSubtasks && ticket.parentId !== null) continue;
      const list = map.get(ticket.columnId) ?? [];
      list.push(ticket);
      map.set(ticket.columnId, list);
    }
    for (const list of map.values()) list.sort(byPosition);
    return map;
  }, [board, showSubtasks]);
  const layout = useMemo(() => (board?.columns ?? []).map((column) => (ticketsByColumn.get(column.id) ?? []).map((ticket) => ticket.id)), [board, ticketsByColumn]);

  const selected = board?.tickets.find((ticket) => ticket.id === selectedId) ?? null;
  const today = localDay(useNow(60_000));
  const doneId = board === null ? null : doneColumnId(board.columns);
  const sourceTags = useMemo(() => new Set((board?.sources ?? []).flatMap((source) => source.tags)), [board]);
  const appPanel = useAppPanel();
  const showTicket = (ticketId: string) => {
    const opened = appPanel.openFixedTab({ surface: { kind: "current" }, tab: TICKET_TAB, target: { ticketId } });
    if (!opened) setSelectedId(ticketId);
  };

  const openDiff = (ticketId: string) => navigate.toPluginPanel("board", { subPath: `diff/${ticketId}` });

  const boardRef = useRef<HTMLDivElement>(null);
  // Focus leaves the board when a card opens in the right panel; keys resume from the card it left.
  const lastCardId = useRef<string | null>(null);
  // A card moved to another column remounts there and has to be focused again.
  const pendingFocusId = useRef<string | null>(null);
  const focusCard = useCallback((ticketId: string) => {
    const card = boardRef.current?.querySelector<HTMLElement>(`[data-ticket-id="${CSS.escape(ticketId)}"]`);
    if (card == null) return;
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);
  useEffect(() => {
    const ticketId = pendingFocusId.current;
    if (ticketId === null) return;
    pendingFocusId.current = null;
    focusCard(ticketId);
  }, [board, focusCard]);
  const cursorId = (): string | null => {
    const focused = document.activeElement?.closest<HTMLElement>("[data-ticket-id]")?.dataset.ticketId;
    const candidate = focused !== undefined && boardRef.current?.contains(document.activeElement) ? focused : lastCardId.current;
    return candidate !== null && layout.some((ids) => ids.includes(candidate)) ? candidate : null;
  };

  const moveTicket = async (ticket: Ticket, columnId: string, visibleIndex: number) => {
    if (board === null) return;
    setSettledId(ticket.id);
    const visible = (ticketsByColumn.get(columnId) ?? []).filter((entry) => entry.id !== ticket.id).map((entry) => entry.id);
    const column = board.tickets.filter((entry) => entry.columnId === columnId && entry.id !== ticket.id).sort(byPosition);
    const index = placementIndex(column.map((entry) => entry.id), visible, visibleIndex);
    // Optimistic reorder so the card lands where it was put before the server answers.
    column.splice(index, 0, { ...ticket, columnId });
    const positions = new Map(column.map((entry, position) => [entry.id, position + 1]));
    setBoard({
      ...board,
      tickets: board.tickets.map((entry) =>
        positions.has(entry.id) ? { ...entry, columnId, position: positions.get(entry.id)! } : entry,
      ),
    });
    try {
      await rpc.call("ticket_move", { id: ticket.id, columnId, index });
    } catch (cause) {
      toastError(cause);
    }
    refetch();
  };

  const runCommand = (command: BoardCommand) => {
    if (board === null) return;
    const current = cursorId();
    const ticket = current === null ? undefined : board.tickets.find((entry) => entry.id === current);
    switch (command.kind) {
      case "cursor": {
        const next = cursorAfter(layout, current, command.motion);
        if (next !== null) focusCard(next);
        return;
      }
      case "move": {
        if (ticket === undefined) return;
        const placement = movePlacement(layout, ticket.id, command.direction);
        if (placement === null) return;
        pendingFocusId.current = ticket.id;
        void moveTicket(ticket, board.columns[placement.column]!.id, placement.index);
        return;
      }
      case "open":
        if (ticket !== undefined) showTicket(ticket.id);
        return;
      case "thread":
        if (ticket?.threadId != null) openThread(ticket.threadId);
        return;
      case "diff":
        if (ticket !== undefined && (ticket.pr !== null || ticket.threadId !== null)) openDiff(ticket.id);
        return;
      case "add":
        pageUi.set({ dialog: "new", newTicketColumn: ticket?.columnId ?? null });
        return;
      case "help":
        pageUi.set({ dialog: "keys" });
        return;
    }
  };
  useBoardKeys(boardRef, diffTicketId === null && !proposalsList && proposalId === null && view === "board" && board !== null, runCommand);

  if (diffTicketId !== null) {
    return <KanbanDiffView key={diffTicketId} subjectId={diffTicketId} onBack={() => navigate.toPluginPanel("board", { subPath: "" })} onOpenThread={openThread} />;
  }
  if (proposalsList) {
    return (
      <div className="h-full min-h-0 overflow-y-auto">
        <ProposalsList onOpen={(id) => navigate.toPluginPanel("board", { subPath: `proposals/${id}` })} />
      </div>
    );
  }
  if (proposalId !== null && board !== null) {
    return (
      <div className="h-full min-h-0 overflow-y-auto">
        <ProposalView dumpId={proposalId} columns={board.columns} onBack={() => navigate.toPluginPanel("board", { subPath: "proposals" })} onOpenThread={openThread} onOpenTicket={showTicket} />
      </div>
    );
  }

  const reviewPr = async (ticket: Ticket) => {
    if (ticket.projectId === null) {
      // No matched project: the card view has the project picker.
      showTicket(ticket.id);
      toast.message("Pick a project to run the review in");
      return;
    }
    try {
      const updated = await rpc.call("ticket_review_pr", { id: ticket.id, projectId: null });
      toast.success("Review started");
      if (updated.reviewThreadId !== null) openThread(updated.reviewThreadId);
    } catch (cause) {
      toastError(cause);
    }
    refetch();
  };

  const onDrop = async (target: DropTarget, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const id = draggingId ?? event.dataTransfer.getData("text/plain");
    setDraggingId(null);
    setDropTarget(null);
    if (id === "" || board === null) return;
    const ticket = board.tickets.find((entry) => entry.id === id);
    if (ticket === undefined) return;
    await moveTicket(ticket, target.columnId, target.index);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error !== null ? (
        <p role="alert" className={cn("px-4 py-2 text-sm text-destructive", enter.drop)}>
          {error}
        </p>
      ) : null}
      {view === "todo" && board !== null ? (
        <div className={cn("min-h-0 flex-1 overflow-y-auto", enter.fade, speed.fast)}>
          <TodoView
            board={board}
            threads={threads}
            rpc={rpc}
            onOpen={(ticket) => showTicket(ticket.id)}
            onOpenThread={openThread}
            refetch={refetch}
          />
        </div>
      ) : null}
      <div
        ref={boardRef}
        tabIndex={-1}
        data-kanban-keys=""
        onFocus={(event) => {
          const ticketId = (event.target as Element).closest<HTMLElement>("[data-ticket-id]")?.dataset.ticketId;
          if (ticketId !== undefined) lastCardId.current = ticketId;
        }}
        // The fade replays each time the board comes back from `hidden` (the todo view).
        className={cn("flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto p-4 outline-none", enter.fade, speed.fast, view === "todo" && "hidden")}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDropTarget(null);
        }}
      >
        {board === null && error === null ? <BoardSkeleton /> : null}
        {board?.columns.map((column, columnIndex) => (
          <ColumnView
            key={column.id}
            index={columnIndex}
            arrival={columnArrival(column.id)}
            ticketArrival={ticketArrival}
            settledId={settledId}
            onSettled={() => setSettledId(null)}
            column={column}
            tickets={ticketsByColumn.get(column.id) ?? []}
            threads={threads}
            hiddenTags={sourceTags}
            today={today}
            isDone={column.id === doneId}
            draggingId={draggingId}
            dropTarget={dropTarget}
            onDragStart={(ticketId, event) => {
              event.dataTransfer.setData("text/plain", ticketId);
              event.dataTransfer.effectAllowed = "move";
              setDraggingId(ticketId);
              setSettledId(null);
            }}
            onDragEnd={() => {
              setDraggingId(null);
              setDropTarget(null);
            }}
            onDragOver={(target, event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (dropTarget?.columnId !== target.columnId || dropTarget.index !== target.index) {
                setDropTarget(target);
              }
            }}
            onDrop={(target, event) => void onDrop(target, event)}
            onOpen={(ticket) => showTicket(ticket.id)}
            onOpenThread={openThread}
            onReview={(ticket) => void reviewPr(ticket)}
            onOpenDiff={(ticket) => openDiff(ticket.id)}
            onAdd={() => pageUi.set({ dialog: "new", newTicketColumn: column.id })}
          />
        ))}
      </div>
      {board !== null ? (
        <>
          <NewTicketDialog
            open={dialog === "new"}
            onOpenChange={(open) => pageUi.set({ dialog: open ? "new" : null })}
            columns={board.columns}
            initialColumnId={newTicketColumn}
            projects={projects}
            rpc={rpc}
            onCreated={refetch}
            onOpenProposals={() => {
              pageUi.set({ dialog: null });
              navigate.toPluginPanel("board", { subPath: "proposals" });
            }}
          />
          <ColumnsDialog
            open={dialog === "columns"}
            onOpenChange={(open) => pageUi.set({ dialog: open ? "columns" : null })}
            columns={board.columns}
            rpc={rpc}
            onChanged={refetch}
          />
          <SourcesDialog
            open={dialog === "sources"}
            onOpenChange={(open) => pageUi.set({ dialog: open ? "sources" : null })}
            sources={board.sources}
            projects={projects}
            jiraSite={board.sync.jiraSite}
            rpc={rpc}
            onChanged={refetch}
          />
          <BoardKeysDialog open={dialog === "keys"} onOpenChange={(open) => pageUi.set({ dialog: open ? "keys" : null })} />
          <TicketDialog
            ticket={selected}
            columns={board.columns}
            projects={projects}
            thread={selected?.threadId == null ? null : threads.get(selected.threadId)}
            threads={threads}
            allTags={board.tags}
            rpc={rpc}
            onOpenDiff={openDiff}
            tickets={board.tickets}
            onOpenTicket={showTicket}
            onClose={() => setSelectedId(null)}
            onChanged={refetch}
            onOpenThread={(threadId) => {
              setSelectedId(null);
              openThread(threadId);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

/** Column-shaped placeholders while the board loads; the delay keeps a fast load from flashing them. */
function BoardSkeleton() {
  return (
    <div role="status" className={cn("flex gap-3 [animation-delay:150ms]", enter.fade)}>
      <span className="sr-only">Loading board…</span>
      {[3, 2, 1].map((cards, index) => (
        <div key={index} aria-hidden className="flex w-72 shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2">
          <div className={cn("relative mx-1 my-1.5 h-3.5 w-24 overflow-hidden rounded bg-muted", SHIMMER)} />
          {Array.from({ length: cards }, (_, card) => (
            <div key={card} className={cn("relative h-[4.5rem] overflow-hidden rounded-md border border-border bg-card", SHIMMER)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function byPosition(a: Ticket, b: Ticket): number {
  return a.position - b.position || a.createdAt - b.createdAt;
}
