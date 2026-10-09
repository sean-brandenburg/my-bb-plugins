import { useRef } from "react";
import type { DragEvent } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { STAGGER, enter, stagger, type Arrival, useEntrance, usePopOnChange } from "bb-motion";
import type { Column, Ticket } from "../shared/board";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { CardView } from "./card";

export interface DropTarget {
  columnId: string;
  index: number;
}

export function ColumnView({
  index: columnIndex,
  arrival,
  ticketArrival,
  settledId,
  onSettled,
  column,
  tickets,
  threads,
  hiddenTags,
  today,
  isDone,
  draggingId,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onOpen,
  onOpenThread,
  onReview,
  onOpenDiff,
  onAdd,
}: {
  index: number;
  arrival: Arrival;
  ticketArrival: (ticketId: string) => Arrival;
  settledId: string | null;
  onSettled: () => void;
  column: Column;
  tickets: Ticket[];
  threads: ReadonlyMap<string, PluginSidebarThread>;
  hiddenTags: ReadonlySet<string>;
  today: string;
  isDone: boolean;
  draggingId: string | null;
  dropTarget: DropTarget | null;
  onDragStart: (ticketId: string, event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onDragOver: (target: DropTarget, event: DragEvent<HTMLElement>) => void;
  onDrop: (target: DropTarget, event: DragEvent<HTMLElement>) => void;
  onOpen: (ticket: Ticket) => void;
  onOpenThread: (threadId: string) => void;
  onReview: (ticket: Ticket) => void;
  onOpenDiff: (ticket: Ticket) => void;
  onAdd: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const indexFromPointer = (event: DragEvent<HTMLElement>): number => {
    const list = listRef.current;
    if (list === null) return tickets.length;
    const cards = Array.from(list.querySelectorAll<HTMLElement>("[data-ticket-id]"));
    let index = 0;
    for (const card of cards) {
      if (card.dataset.ticketId === draggingId) continue;
      const rect = card.getBoundingClientRect();
      if (event.clientY > rect.top + rect.height / 2) index += 1;
    }
    return index;
  };
  const isTarget = dropTarget?.columnId === column.id;
  const entrance = useEntrance(arrival === "intro" ? cn(enter.rise, STAGGER) : arrival === "new" ? enter.rise : undefined);
  const countPop = usePopOnChange(tickets.length);
  return (
    <section
      aria-label={column.name}
      style={stagger(columnIndex)}
      onAnimationEnd={entrance.onAnimationEnd}
      onDragOver={(event) => onDragOver({ columnId: column.id, index: indexFromPointer(event) }, event)}
      onDrop={(event) => onDrop({ columnId: column.id, index: indexFromPointer(event) }, event)}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30",
        entrance.className,
        isTarget && draggingId !== null && "border-primary/50 bg-primary/5",
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{column.name}</h2>
        <span key={countPop.key} onAnimationEnd={countPop.onAnimationEnd} className={cn("text-xs tabular-nums text-muted-foreground", countPop.className)}>
          {tickets.length}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground"
          aria-label={`Add card to ${column.name}`}
          onClick={onAdd}
        >
          <Icon name="Plus" className="size-3.5" />
        </Button>
      </header>
      {/* pt-0.5 leaves room for a hovered card's lift so the top card isn't clipped. */}
      <div ref={listRef} className="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 pt-0.5">
        {tickets.map((ticket, index) => (
          <div key={ticket.id} className="flex flex-col gap-2">
            {isTarget && dropTarget.index === index && draggingId !== ticket.id ? (
              <div className="h-0.5 rounded bg-primary" />
            ) : null}
            <CardView
              ticket={ticket}
              arrival={ticketArrival(ticket.id)}
              // A diagonal wave: each column starts a step after the one to its left.
              staggerIndex={columnIndex + index + 1}
              settling={settledId === ticket.id}
              onSettled={onSettled}
              thread={ticket.threadId === null ? null : threads.get(ticket.threadId)}
              hiddenTags={hiddenTags}
              today={today}
              isDone={isDone}
              isDragging={draggingId === ticket.id}
              onOpen={() => onOpen(ticket)}
              onOpenThread={() => {
                if (ticket.threadId !== null) onOpenThread(ticket.threadId);
              }}
              onOpenReview={() => {
                if (ticket.reviewThreadId !== null) onOpenThread(ticket.reviewThreadId);
              }}
              onReview={() => onReview(ticket)}
              onOpenDiff={() => onOpenDiff(ticket)}
              onDragStart={(event) => onDragStart(ticket.id, event)}
              onDragEnd={onDragEnd}
            />
          </div>
        ))}
        {isTarget && dropTarget.index >= tickets.length ? <div className="h-0.5 rounded bg-primary" /> : null}
        {tickets.length === 0 && !isTarget ? (
          <p className={cn("px-1 py-3 text-center text-xs text-muted-foreground", enter.fade)}>Drop cards here</p>
        ) : null}
      </div>
    </section>
  );
}
