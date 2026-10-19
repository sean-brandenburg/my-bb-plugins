import { rpcContract } from "../contract";
import { initialColumn } from "./board";
import type { KanbanContext } from "./context";
import { rowToDump } from "./db/rows";
import type { Services } from "./services";

/** The board's RPC surface; each handler hands off to the feature that owns it. */
export function registerRpc(ctx: KanbanContext, services: Services): void {
  const { bb, db, stmts, sync, publish } = ctx;
  const { board, subjects, threads, projects, changes, viewed, prComments, diffComments, reviews, tour, dumps, subtasks, sourceSync, codeReviewThreads } = services;
  const { resolveDiffSubject } = subjects;

  bb.rpc.register(rpcContract, {
    board_get: async () => ({
      columns: await board.getColumns(),
      tickets: stmts.all.all().map(board.hydrate),
      sources: await board.getSources(),
      tags: board.allTags(),
      sync,
      dumps: stmts.dumpsOpen.all().map(rowToDump),
    }),
    dump_create: ({ text, projectId }) => dumps.createDump(text, projectId),
    dumps_list: ({ includeClosed }) => dumps.listDumps(includeClosed),
    dump_refine: ({ id, answers, notes }) => dumps.refineDump(id, answers, notes),
    dump_finalize: ({ id, tickets, columnId, startThreads }) => dumps.finalizeDump(id, tickets, columnId, startThreads),
    dump_discard: ({ id }) => dumps.discardDump(id),
    ticket_create: async (input) => {
      const columns = await board.getColumns();
      const columnId =
        input.columnId !== undefined && columns.some((column) => column.id === input.columnId)
          ? input.columnId
          : initialColumn(columns, null);
      if (input.parentId !== null && stmts.byId.get(input.parentId) === undefined) throw new Error(`No ticket with id ${input.parentId}`);
      const parentProject = input.parentId === null ? null : (stmts.byId.get(input.parentId)?.project_id ?? null);
      const projectId = input.projectId ?? parentProject;
      const ticket = db.transaction(() => {
        const created = board.createTicket({
          title: input.title,
          description: input.description,
          columnId,
          kind: "adhoc",
          tags: input.tags,
          threadId: null,
          projectId,
          pr: null,
          parentId: input.parentId,
          dueDate: input.dueDate,
        });
        for (const subtask of input.subtasks) {
          board.createTicket({
            title: subtask.title,
            description: subtask.description,
            columnId,
            kind: "adhoc",
            tags: subtask.tags,
            threadId: null,
            projectId,
            pr: null,
            parentId: created.id,
          });
        }
        return board.getTicket(created.id);
      })();
      publish();
      if (input.startThread && input.projectId !== null) {
        return threads.spawnThreadForTicket(ticket.id, input.projectId);
      }
      return ticket;
    },
    ticket_update: ({ id, title, description }) => board.updateText(id, title, description),
    ticket_set_parent: ({ id, parentId }) => board.setParent(id, parentId),
    ticket_breakdown: ({ id, projectId, guidance }) => subtasks.breakdown(id, projectId, guidance),
    ticket_start_children: ({ id, mode, projectId }) => subtasks.startChildren(id, mode, projectId),
    ticket_set_tags: ({ id, tags }) => {
      board.getTicket(id);
      return board.setTags(id, tags);
    },
    ticket_set_due_date: ({ id, dueDate }) => board.setDueDate(id, dueDate),
    sources_set: async ({ sources }) => {
      const ids = new Set<string>();
      for (const source of sources) {
        if (ids.has(source.id)) throw new Error(`Duplicate source id "${source.id}"`);
        ids.add(source.id);
      }
      await bb.storage.kv.set("sources", sources);
      publish();
      void sourceSync.runSync();
      return { sources };
    },
    ticket_move: async ({ id, columnId, index }) => {
      const columns = await board.getColumns();
      if (!columns.some((column) => column.id === columnId)) {
        throw new Error(`No column with id ${columnId}`);
      }
      return board.moveTicket(id, columnId, index);
    },
    ticket_delete: ({ id }) => board.deleteTicket(id),
    ticket_restore: ({ id }) => board.restoreTicket(id),
    ticket_start_thread: ({ id, projectId }) => threads.spawnThreadForTicket(id, projectId),
    ticket_review_pr: ({ id, projectId, mode }) => reviews.startReview(id, projectId, mode),
    review_availability: async ({ ticketId }) => ({ reason: await reviews.reviewUnavailableReason(ticketId) }),
    review_list: ({ ticketId }) => reviews.listReviews(ticketId),
    review_apply: ({ ticketId, reviewId, push }) => reviews.spawnApplyForReview(ticketId, reviewId, push),
    review_set_selection: ({ reviewId, findingId, selected }) => reviews.setSelection(reviewId, findingId, selected),
    review_set_applied: ({ reviewId, findingId, applied }) => reviews.setApplied(reviewId, findingId, applied),
    review_edit_finding: ({ reviewId, findingId, edit }) => reviews.editFinding(reviewId, findingId, edit),
    review_make_card: ({ reviewId, findingId }) => reviews.makeFindingCard(reviewId, findingId),
    diff_get: async ({ ticketId, refresh }) => changes.ticketDiff(await resolveDiffSubject(ticketId), refresh),
    diff_structural: async ({ ticketId, path }) => changes.structuralDiff(await resolveDiffSubject(ticketId), path),
    symbol_definitions: async ({ ticketId, symbol }) => changes.symbolDefinitions(await resolveDiffSubject(ticketId), symbol),
    symbol_usages: async ({ ticketId, symbol }) => changes.symbolUsages(await resolveDiffSubject(ticketId), symbol),
    symbol_peek_file: async ({ ticketId, path, startLine, endLine }) => changes.peekFile(await resolveDiffSubject(ticketId), path, startLine, endLine),
    diff_comments_list: ({ ticketId }) => diffComments.listDiffComments(ticketId),
    narrative_get: async ({ ticketId }) => tour.latestNarrative(await resolveDiffSubject(ticketId)),
    narrative_generate: async ({ ticketId }) => tour.spawnNarrative(await resolveDiffSubject(ticketId)),
    narrative_story: async ({ ticketId }) => tour.narrativeStory(await resolveDiffSubject(ticketId)),
    hunk_explanations_list: async ({ ticketId }) => tour.listExplanations(await resolveDiffSubject(ticketId)),
    code_review_threads: async ({ ticketId }) => ({ threads: codeReviewThreads.codeReviewThreads((await resolveDiffSubject(ticketId)).id) }),
    hunk_explain: async ({ ticketId, path, side, startLine, endLine }) => tour.explainHunk(await resolveDiffSubject(ticketId), path, side, Math.min(startLine, endLine), Math.max(startLine, endLine)),
    diff_delta: async ({ ticketId }) => ({ delta: await viewed.diffDelta(await resolveDiffSubject(ticketId)) }),
    diff_viewed_list: async ({ ticketId }) => viewed.listViewed(await resolveDiffSubject(ticketId)),
    diff_viewed_set: async ({ ticketId, path, viewed: isViewed }) => viewed.setViewed(await resolveDiffSubject(ticketId), path, isViewed),
    diff_comment_add: (input) => diffComments.addDiffComment(input),
    diff_comment_update: (input) => diffComments.updateDiffComment(input),
    diff_comment_delete: ({ id }) => diffComments.deleteDiffComment(id),
    diff_comments_submit: (input) => diffComments.submitDiffComments(input),
    comments_list: ({ ticketId }) => prComments.listComments(ticketId),
    comment_set_selected: ({ id, selected }) => prComments.setSelected(id, selected),
    comment_set_addressed: ({ id, addressed }) => prComments.setAddressed(id, addressed),
    comments_apply: ({ ticketId, push }) => prComments.spawnApplyForComments(ticketId, push),
    review_reset_selection: ({ reviewId }) => reviews.resetSelection(reviewId),
    ticket_link_thread: ({ id, threadId }) => threads.linkThread(id, threadId),
    columns_set: ({ columns }) => board.setColumns(columns),
    sync_now: async () => {
      await sourceSync.runSync();
      return sync;
    },
  });
}
