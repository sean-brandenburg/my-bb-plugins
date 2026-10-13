import { z } from "zod";
import { DEFAULT_COLUMNS, DEFAULT_SOURCES, columnSchema, sourceSchema, type Column, type JiraIssue, type PullRequest, type Source, type Ticket } from "../shared/board";
import { COLUMN, doneColumnId } from "../shared/columns";
import type { DiffCommentTarget } from "../shared/comments";
import type { Review } from "../shared/review";
import type { KanbanContext } from "./context";
import { rowToComment, rowToReview, rowToTicket, type TicketRow } from "./db/rows";
import { normalizeTags, parseStringArray, shortId } from "./util";

/** Columns a brand-new card lands in, by what the card is. */
export function initialColumn(columns: Column[], pr: PullRequest | null, jira: JiraIssue | null = null): string {
  const ids = new Set(columns.map((column) => column.id));
  const pick = (...preferred: string[]) =>
    preferred.find((id) => ids.has(id)) ?? columns[0]!.id;
  if (jira !== null) {
    if (jira.statusCategory === "done") return pick(COLUMN.done);
    if (jira.statusCategory === "indeterminate") return pick(COLUMN.inProgress, COLUMN.todo);
    return pick(COLUMN.todo, COLUMN.backlog);
  }
  if (pr === null) return pick(COLUMN.backlog, COLUMN.todo);
  if (pr.state === "merged" || pr.state === "closed") return pick(COLUMN.done);
  // Every new PR card, authored or review-requested, starts as work to do.
  return pick(COLUMN.todo, COLUMN.backlog);
}

/** Columns are never empty: storage falls back to the defaults and `columns_set` requires one. */
export function doneColumn(columns: Column[]): string {
  return doneColumnId(columns)!;
}

/** Cards, columns, sources and tags: the board's own storage. */
export function createBoardStore(ctx: KanbanContext) {
  const { bb, db, stmts, publish } = ctx;

  function latestReviewFor(ticketId: string): Review | null {
    const row = stmts.latestReview.get(ticketId);
    return row === undefined ? null : rowToReview(row);
  }

  function commentCounts(row: TicketRow): Ticket["comments"] {
    if (row.kind !== "pr") return null;
    const comments = stmts.commentsForTicket.all(row.id).map(rowToComment);
    return {
      total: comments.length,
      open: comments.filter((comment) => comment.addressedAt === null && !comment.mine).length,
      selected: comments.filter((comment) => comment.selected).length,
    };
  }

  let reviewTagCache = "pr-reviews";
  function canPostToGithub(row: TicketRow): boolean {
    return row.kind === "pr" && row.pr_repo !== null && row.pr_number !== null;
  }

  function defaultCommentTarget(row: TicketRow): DiffCommentTarget {
    return canPostToGithub(row) && parseStringArray(row.tags).includes(reviewTagCache) ? "github" : "local";
  }

  let doneColumnCache: string = COLUMN.done;
  function childCounts(row: TicketRow): Ticket["children"] {
    const children = stmts.childrenOf.all(row.id);
    return {
      total: children.length,
      done: children.filter((child) => child.column_id === doneColumnCache).length,
      withThread: children.filter((child) => child.thread_id !== null).length,
    };
  }

  function hydrate(row: TicketRow): Ticket {
    return rowToTicket(row, latestReviewFor(row.id), commentCounts(row), {
      pendingDiffComments: stmts.pendingDiffCommentCount.get(row.id)?.n ?? 0,
      canPostToGithub: canPostToGithub(row),
      defaultCommentTarget: defaultCommentTarget(row),
      children: childCounts(row),
    });
  }

  /** Walk up from `parentId`; true when `id` is an ancestor (or the same card), which would make a cycle. */
  function wouldCycle(id: string, parentId: string): boolean {
    let current: string | null = parentId;
    for (let depth = 0; current !== null && depth < 64; depth += 1) {
      if (current === id) return true;
      current = stmts.byId.get(current)?.parent_id ?? null;
    }
    return false;
  }

  function setParent(id: string, parentId: string | null): Ticket {
    getTicket(id);
    if (parentId !== null) {
      if (stmts.byId.get(parentId) === undefined) throw new Error(`No ticket with id ${parentId}`);
      if (wouldCycle(id, parentId)) throw new Error("A card cannot be nested inside itself or one of its own subtasks");
    }
    stmts.setParent.run(parentId, Date.now(), id);
    publish();
    return getTicket(id);
  }

  async function getColumns(): Promise<Column[]> {
    const stored = await bb.storage.kv.get<Column[]>("columns");
    const parsed = z.array(columnSchema).min(1).safeParse(stored);
    const columns = parsed.success ? parsed.data : DEFAULT_COLUMNS;
    doneColumnCache = doneColumn(columns);
    return columns;
  }

  async function getSources(): Promise<Source[]> {
    const stored = await bb.storage.kv.get<Source[]>("sources");
    const parsed = z.array(sourceSchema).safeParse(stored);
    return parsed.success ? parsed.data : DEFAULT_SOURCES;
  }

  function allTags(): string[] {
    const tags = new Set<string>();
    for (const row of stmts.all.all()) for (const tag of parseStringArray(row.tags)) tags.add(tag);
    return [...tags].sort();
  }

  function setTags(id: string, tags: readonly string[]): Ticket {
    stmts.setTags.run(JSON.stringify(normalizeTags(tags)), Date.now(), id);
    publish();
    return getTicket(id);
  }

  function setDueDate(id: string, dueDate: string | null): Ticket {
    getTicket(id);
    stmts.setDueDate.run(dueDate, Date.now(), id);
    publish();
    return getTicket(id);
  }

  function getTicket(id: string): Ticket {
    const row = stmts.byId.get(id);
    if (row === undefined) throw new Error(`No ticket with id ${id}`);
    return hydrate(row);
  }

  function nextPosition(columnId: string): number {
    return (stmts.maxPosition.get(columnId)?.max ?? 0) + 1;
  }

  function moveTicket(id: string, columnId: string, index: number | null): Ticket {
    const now = Date.now();
    const move = db.transaction(() => {
      const current = stmts.byId.get(id);
      if (current === undefined) throw new Error(`No ticket with id ${id}`);
      const siblings = stmts.inColumn
        .all(columnId)
        .filter((row) => row.id !== id);
      const at = index === null ? siblings.length : Math.min(index, siblings.length);
      siblings.splice(at, 0, current);
      siblings.forEach((row, position) => {
        if (row.id === id) stmts.setColumn.run({ column_id: columnId, position: position + 1, now, id });
        else if (row.position !== position + 1) stmts.setPosition.run(position + 1, row.id);
      });
    });
    move();
    publish();
    return getTicket(id);
  }

  function createTicket(input: {
    title: string;
    description: string;
    columnId: string;
    kind: Ticket["kind"];
    tags?: readonly string[];
    sourceId?: string | null;
    threadId: string | null;
    projectId: string | null;
    pr: PullRequest | null;
    jira?: JiraIssue | null;
    parentId?: string | null;
    dueDate?: string | null;
  }): Ticket {
    const now = Date.now();
    const id = shortId();
    stmts.insert.run({
      id,
      title: input.title,
      description: input.description,
      column_id: input.columnId,
      kind: input.kind,
      tags: JSON.stringify(normalizeTags(input.tags ?? [])),
      source_id: input.sourceId ?? null,
      thread_id: input.threadId,
      project_id: input.projectId,
      parent_id: input.parentId ?? null,
      pr_repo: input.pr?.repo ?? null,
      pr_number: input.pr?.number ?? null,
      pr_url: input.pr?.url ?? null,
      pr_role: input.pr?.role ?? null,
      pr_state: input.pr?.state ?? null,
      pr_author: input.pr?.author ?? null,
      pr_updated_at: input.pr?.updatedAt ?? null,
      pr_head_ref: input.pr?.headRef ?? null,
      pr_checks: input.pr?.checks ?? null,
      jira_key: input.jira?.key ?? null,
      jira_url: input.jira?.url ?? null,
      jira_status: input.jira?.status ?? null,
      jira_status_category: input.jira?.statusCategory ?? null,
      jira_issue_type: input.jira?.issueType ?? null,
      jira_priority: input.jira?.priority ?? null,
      jira_assignee: input.jira?.assignee ?? null,
      jira_updated_at: input.jira?.updatedAt ?? null,
      due_date: input.dueDate ?? null,
      position: nextPosition(input.columnId),
      created_at: now,
      updated_at: now,
    });
    return getTicket(id);
  }

  function setReviewTag(raw: string): void {
    reviewTagCache = normalizeTags([raw])[0] ?? "pr-reviews";
  }

  function updateText(id: string, title: string | undefined, description: string | undefined): Ticket {
    const current = getTicket(id);
    // Sync keeps a title the user has changed instead of taking the PR's or issue's again.
    const edited = title !== undefined && title !== current.title ? 1 : 0;
    stmts.setText.run(title ?? current.title, edited, description ?? current.description, Date.now(), id);
    publish();
    return getTicket(id);
  }

  function deleteTicket(id: string): { deleted: boolean } {
    // Subtasks outlive their parent as top-level cards rather than disappearing with it.
    stmts.detachChildren.run(Date.now(), id);
    stmts.deleteReviewsForTicket.run(id);
    stmts.deleteCommentsForTicket.run(id);
    stmts.deleteCommentAppliesForTicket.run(id);
    stmts.deleteDiffCommentsForTicket.run(id);
    stmts.deleteViewedForTicket.run(id);
    stmts.deleteNarrativesForTicket.run(id);
    stmts.deleteExplanationsForTicket.run(id);
    const result = stmts.remove.run(id);
    if (result.changes > 0) publish();
    return { deleted: result.changes > 0 };
  }

  async function setColumns(columns: Column[]): Promise<{ columns: Column[] }> {
    const ids = new Set<string>();
    for (const column of columns) {
      if (!/^[a-z0-9][a-z0-9-]*$/u.test(column.id)) {
        throw new Error(`Column id "${column.id}" must be lowercase letters, digits, and dashes`);
      }
      if (ids.has(column.id)) throw new Error(`Duplicate column id "${column.id}"`);
      ids.add(column.id);
    }
    const previous = await getColumns();
    const fallback = columns[0]!.id;
    const now = Date.now();
    db.transaction(() => {
      for (const column of previous) {
        if (!ids.has(column.id)) stmts.moveColumn.run(fallback, now, now, column.id);
      }
    })();
    await bb.storage.kv.set("columns", columns);
    publish();
    return { columns };
  }

  return {
    hydrate,
    getTicket,
    createTicket,
    moveTicket,
    updateText,
    deleteTicket,
    setParent,
    setTags,
    setDueDate,
    allTags,
    getColumns,
    setColumns,
    getSources,
    setReviewTag,
  };
}

export type BoardStore = ReturnType<typeof createBoardStore>;
