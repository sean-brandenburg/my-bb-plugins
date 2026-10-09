import type { Column, Ticket } from "../shared/board";
import { doneColumn, type BoardStore } from "./board";
import type { CardThreads } from "./card-threads";
import type { KanbanContext } from "./context";
import type { Projects } from "./projects";

function breakdownPrompt(ticket: Ticket, guidance: string): string {
  const body = ticket.description.trim();
  return [
    `Break the card "${ticket.title}" (kanban ticket ${ticket.id}) into subtasks.`,
    body === "" ? "" : `\nDescription:\n${body}\n`,
    guidance.trim() === "" ? "" : `\nGuidance from the user:\n${guidance.trim()}\n`,
    "Read the relevant code first so the split reflects how the work actually divides. Aim for 3–8 subtasks that are concrete, independently workable, and each small enough for one agent session; order them so dependencies come first.",
    "Create each one with:",
    `  bb kanban add "<title>" --parent ${ticket.id} --description "<what done looks like, files involved, how to verify>"`,
    `Existing subtasks: run \`bb kanban subtasks --ticket ${ticket.id}\` first and do not duplicate them.`,
    `Do not start the work. When finished, run \`bb kanban subtasks --ticket ${ticket.id}\` and summarize the plan in one list.`,
  ].join("\n");
}

/** Subtasks: an agent splitting a card, and agents started on its open subtasks. */
export function createSubtasks(ctx: KanbanContext, { board, threads, projects }: { board: BoardStore; threads: CardThreads; projects: Projects }) {
  const { bb, stmts, publish } = ctx;
  const { getTicket, getColumns } = board;
  const { spawnThreadForTicket, promptTicketThread } = threads;
  const { projectForTicket } = projects;

  function sequentialPrompt(ticket: Ticket, columns: Column[]): string {
    const columnList = columns.map((column) => `\`${column.id}\``).join(", ");
    const done = doneColumn(columns);
    const open = stmts.childrenOf.all(ticket.id).filter((child) => child.column_id !== done);
    return [
      `Work through every open subtask of "${ticket.title}" (kanban ticket ${ticket.id}), in order:`,
      ...open.map((child, index) => `  ${index + 1}. ${child.id} — ${child.title}${child.description.trim() === "" ? "" : `: ${child.description.trim().split("\n")[0]}`}`),
      "",
      `1. \`bb kanban subtasks --ticket ${ticket.id} --json\` lists them; skip any already in the done column or already linked to another thread.`,
      "2. For each subtask: `bb kanban move in-progress --ticket <subtask-id>`, do the work described on it, verify it, commit with a message naming the subtask, then `bb kanban move done --ticket <subtask-id>`.",
      "3. If a subtask is blocked or unclear, leave it where it is, say why, and continue with the next one.",
      `4. When all are done, \`bb kanban move done\` for this card and summarize what was committed. Columns: ${columnList}.`,
      "",
      "Do not push unless the user asks.",
    ].join("\n");
  }

  async function startChildren(ticketId: string, mode: "parallel" | "sequential", explicitProjectId: string | null): Promise<{ ticket: Ticket; started: number; skipped: number }> {
    const ticket = getTicket(ticketId);
    const columns = await getColumns();
    const done = doneColumn(columns);
    const projectId = await projectForTicket(ticket, explicitProjectId);
    const open = stmts.childrenOf.all(ticket.id).filter((child) => child.column_id !== done);
    if (open.length === 0) throw new Error("No open subtasks to start");
    if (mode === "sequential") {
      await promptTicketThread(ticket, projectId, sequentialPrompt(ticket, columns), `Subtasks: ${ticket.title}`, "subtasks");
      return { ticket: getTicket(ticket.id), started: open.length, skipped: 0 };
    }
    let started = 0;
    let skipped = 0;
    for (const child of open) {
      if (child.thread_id !== null) {
        skipped += 1;
        continue;
      }
      if (child.project_id === null) stmts.setThread.run(null, projectId, Date.now(), child.id);
      try {
        await spawnThreadForTicket(child.id, child.project_id ?? projectId);
        started += 1;
      } catch (error) {
        bb.log.warn(`could not start subtask ${child.id}: ${String(error)}`);
        skipped += 1;
      }
    }
    publish();
    return { ticket: getTicket(ticket.id), started, skipped };
  }

  async function breakdown(id: string, projectId: string | null, guidance: string): Promise<Ticket> {
    const ticket = getTicket(id);
    return promptTicketThread(ticket, await projectForTicket(ticket, projectId), breakdownPrompt(ticket, guidance), ticket.title, "breakdown");
  }

  return { startChildren, breakdown };
}

export type Subtasks = ReturnType<typeof createSubtasks>;
