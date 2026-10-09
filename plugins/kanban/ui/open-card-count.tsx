import { doneColumnId } from "../shared/columns";
import { useBoard } from "./data";

/** Live count of cards that are not done, shown beside the sidebar entry. */
export function OpenCardCount() {
  const { board } = useBoard();
  if (board === null) return null;
  const doneId = doneColumnId(board.columns);
  const open = board.tickets.filter((ticket) => ticket.columnId !== doneId).length;
  return open === 0 ? null : <span className="text-xs tabular-nums text-muted-foreground">{open}</span>;
}
