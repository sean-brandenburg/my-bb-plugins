import { useMemo, useState } from "react";
import type { DragEvent } from "react";
import { useBbNavigate, experimental_useAppPanel as useAppPanel } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { Ticket } from "../shared/board";
import { cn } from "@/lib/utils";
import { useBoard, useProjects, useThreadIndex, useOpenThread } from "./data";
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

  const ticketsByColumn = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const ticket of board?.tickets ?? []) {
      if (!showSubtasks && ticket.parentId !== null) continue;
      const list = map.get(ticket.columnId) ?? [];
      list.push(ticket);
      map.set(ticket.columnId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
    return map;
  }, [board, showSubtasks]);

  const selected = board?.tickets.find((ticket) => ticket.id === selectedId) ?? null;
  const sourceTags = useMemo(() => new Set((board?.sources ?? []).flatMap((source) => source.tags)), [board]);
  const appPanel = useAppPanel();
  const showTicket = (ticketId: string) => {
    const opened = appPanel.openFixedTab({ surface: { kind: "current" }, tab: TICKET_TAB, target: { ticketId } });
    if (!opened) setSelectedId(ticketId);
  };

  const openDiff = (ticketId: string) => navigate.toPluginPanel("board", { subPath: `diff/${ticketId}` });

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
    // Optimistic reorder so the card lands where it was dropped before the server answers.
    const siblings = (ticketsByColumn.get(target.columnId) ?? []).filter((entry) => entry.id !== id);
    siblings.splice(Math.min(target.index, siblings.length), 0, { ...ticket, columnId: target.columnId });
    const positions = new Map(siblings.map((entry, index) => [entry.id, index + 1]));
    setBoard({
      ...board,
      tickets: board.tickets.map((entry) =>
        positions.has(entry.id)
          ? { ...entry, columnId: target.columnId, position: positions.get(entry.id)! }
          : entry,
      ),
    });
    try {
      await rpc.call("ticket_move", { id, columnId: target.columnId, index: target.index });
    } catch (cause) {
      toastError(cause);
    }
    refetch();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error !== null ? (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {view === "todo" && board !== null ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
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
        className={cn("flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto p-4", view === "todo" && "hidden")}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDropTarget(null);
        }}
      >
        {board === null && error === null ? (
          <p className="text-sm text-muted-foreground">Loading board…</p>
        ) : null}
        {board?.columns.map((column) => (
          <ColumnView
            key={column.id}
            column={column}
            tickets={ticketsByColumn.get(column.id) ?? []}
            threads={threads}
            hiddenTags={sourceTags}
            draggingId={draggingId}
            dropTarget={dropTarget}
            onDragStart={(ticketId, event) => {
              event.dataTransfer.setData("text/plain", ticketId);
              event.dataTransfer.effectAllowed = "move";
              setDraggingId(ticketId);
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
