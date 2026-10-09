import { useState } from "react";
import type { FormEvent } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { Board, Ticket } from "../shared/board";
import { doneColumnId, todoColumnId } from "../shared/columns";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseQuickAdd } from "./format";
import { type Rpc } from "./data";
import { ThreadStatusDot } from "./primitives";
import { tagTone, TagBadges } from "./tags";
import { PrBadges, JiraBadges, ReviewBadge } from "./badges";
import { toastError } from "./actions";

export function TodoView({
  board,
  threads,
  rpc,
  onOpen,
  onOpenThread,
  refetch,
}: {
  board: Board;
  threads: ReadonlyMap<string, PluginSidebarThread>;
  rpc: Rpc;
  onOpen: (ticket: Ticket) => void;
  onOpenThread: (threadId: string) => void;
  refetch: () => void;
}) {
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [quick, setQuick] = useState("");
  const doneId = doneColumnId(board.columns);
  const todoId = todoColumnId(board.columns);
  const matches = (ticket: Ticket) => (showDone || ticket.columnId !== doneId) && tagFilter.every((tag) => ticket.tags.includes(tag));
  const byId = new Map(board.tickets.map((ticket) => [ticket.id, ticket]));
  // A subtask shows under its parent when the parent is listed; otherwise it stands on its own.
  const visible = board.tickets
    .filter((ticket) => matches(ticket) && (ticket.parentId === null || !byId.has(ticket.parentId) || !matches(byId.get(ticket.parentId)!)))
    .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  const childrenOf = (id: string) => board.tickets.filter((ticket) => ticket.parentId === id && matches(ticket)).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  const byColumn = board.columns
    .map((column) => ({ column, tickets: visible.filter((ticket) => ticket.columnId === column.id) }))
    .filter((group) => group.tickets.length > 0);
  const toggleDone = async (ticket: Ticket) => {
    const target = ticket.columnId === doneId ? todoId : doneId;
    if (target === null) return;
    try {
      await rpc.call("ticket_move", { id: ticket.id, columnId: target, index: null });
    } catch (cause) {
      toastError(cause);
    }
    refetch();
  };
  const quickAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { title, tags } = parseQuickAdd(quick);
    if (title === "" || todoId === null) return;
    try {
      await rpc.call("ticket_create", { title, tags: [...new Set([...tags, ...tagFilter])], columnId: todoId });
      setQuick("");
    } catch (cause) {
      toastError(cause);
    }
    refetch();
  };
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-5">
      <form onSubmit={quickAdd} className="flex items-center gap-2">
        <Input
          value={quick}
          onChange={(event) => setQuick(event.target.value)}
          placeholder="Add a todo… use #tag for tags"
          aria-label="New todo"
        />
        <Button type="submit" disabled={parseQuickAdd(quick).title === ""}>
          <Icon name="Plus" className="size-4" />
          Add
        </Button>
      </form>
      {board.tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {board.tags.map((tag) => {
            const active = tagFilter.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() => setTagFilter(active ? tagFilter.filter((entry) => entry !== tag) : [...tagFilter, tag])}
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
                  active ? cn(tagTone(tag).chip, "font-medium") : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                <span className={cn("size-1.5 rounded-full", tagTone(tag).dot)} aria-hidden="true" />
                {tag}
              </button>
            );
          })}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox checked={showDone} onCheckedChange={(checked) => setShowDone(checked === true)} aria-label="Show done" />
            Show done
          </label>
        </div>
      ) : null}
      {byColumn.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing to do{tagFilter.length > 0 ? " with these tags" : ""}.
        </p>
      ) : null}
      {byColumn.map(({ column, tickets }) => (
        <section key={column.id} aria-label={column.name}>
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {column.name} <span className="font-normal tabular-nums">{tickets.length}</span>
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {tickets.flatMap((ticket) => [ticket, ...childrenOf(ticket.id)]).map((ticket) => (
              <li key={ticket.id} className={cn("flex items-center gap-3 px-3 py-2 text-sm", ticket.parentId !== null && "pl-9")}>
                <Checkbox
                  checked={ticket.columnId === doneId}
                  onCheckedChange={() => void toggleDone(ticket)}
                  aria-label={ticket.columnId === doneId ? `Reopen "${ticket.title}"` : `Mark "${ticket.title}" done`}
                />
                <button
                  type="button"
                  onClick={() => onOpen(ticket)}
                  className={cn("min-w-0 flex-1 truncate text-left hover:underline", ticket.columnId === doneId && "text-muted-foreground line-through")}
                >
                  {ticket.title}
                </button>
                <div className="hidden flex-wrap items-center gap-1 sm:flex">
                  <PrBadges ticket={ticket} />
                  <JiraBadges ticket={ticket} />
                  <TagBadges tags={ticket.tags} />
                  <ReviewBadge ticket={ticket} />
                </div>
                {ticket.threadId !== null ? (
                  <button
                    type="button"
                    aria-label="Open thread"
                    onClick={() => onOpenThread(ticket.threadId!)}
                    className="flex shrink-0 items-center gap-1.5 rounded p-1 text-muted-foreground hover:bg-state-hover hover:text-foreground"
                  >
                    <ThreadStatusDot thread={threads.get(ticket.threadId)} />
                    <Icon name="MessageSquare" className="size-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
