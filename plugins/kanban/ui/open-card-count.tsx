import { doneColumnId } from "../shared/columns";
import { cn } from "@/lib/utils";
import { useBoard } from "./data";
import { usePopOnChange } from "bb-motion";

/** Live count of cards that are not done, shown beside the sidebar entry. */
export function OpenCardCount() {
  const { board } = useBoard();
  const doneId = board === null ? null : doneColumnId(board.columns);
  const open = board === null ? null : board.tickets.filter((ticket) => ticket.columnId !== doneId).length;
  const pop = usePopOnChange(open);
  if (open === null || open === 0) return null;
  return (
    <span key={pop.key} onAnimationEnd={pop.onAnimationEnd} className={cn("inline-block text-xs tabular-nums text-muted-foreground", pop.className)}>
      {open}
    </span>
  );
}
