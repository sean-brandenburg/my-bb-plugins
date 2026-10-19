import type { CodeReviewThread } from "../shared/tour";
import type { KanbanContext } from "./context";

/** A new key re-syncs every existing code review thread once on load; change it when another thread kind joins the hidden set. */
const CODE_REVIEW_THREADS_HIDDEN_KEY = "codeReviewThreadsHidden.checks";

/** Threads the code review buttons start (reviews, applies, tours, explanations), hidden from the sidebar when the setting says so. */
export function createCodeReviewThreads(ctx: KanbanContext) {
  const { bb, settings, stmts } = ctx;

  function codeReviewThreads(subjectId: string): CodeReviewThread[] {
    const threads: CodeReviewThread[] = [];
    for (const row of stmts.reviewsForTicket.all(subjectId)) {
      threads.push({
        threadId: row.thread_id,
        kind: "review",
        label: row.since_commit_sha === null ? "Review" : `Re-review since ${row.since_commit_sha.slice(0, 7)}`,
        status: row.status,
        startedAt: row.created_at,
      });
      if (row.apply_thread_id !== null && row.apply_started_at !== null) {
        threads.push({ threadId: row.apply_thread_id, kind: "apply", label: "Apply review findings", status: row.apply_completed_at === null ? "running" : "completed", startedAt: row.apply_started_at });
      }
    }
    for (const row of stmts.commentAppliesForTicket.all(subjectId)) {
      threads.push({ threadId: row.thread_id, kind: "apply-comments", label: "Address comments", status: row.completed_at === null ? "running" : "completed", startedAt: row.started_at });
    }
    for (const row of stmts.narrativesForTicket.all(subjectId)) {
      threads.push({ threadId: row.thread_id, kind: "narrative", label: "Narrative", status: row.status, startedAt: row.created_at });
    }
    for (const row of stmts.explanationsForTicket.all(subjectId)) {
      threads.push({ threadId: row.thread_id, kind: "explain", label: `Explain ${row.path.split("/").pop()}:${row.start_line}`, status: row.status, startedAt: row.created_at });
    }
    return threads.sort((a, b) => b.startedAt - a.startedAt);
  }

  /** Reviews, applies, tours and explanations: the threads the code review buttons start. */
  async function codeReviewThreadVisibility(): Promise<"hidden" | "visible"> {
    return (await settings.get()).hideReviewThreads ? "hidden" : "visible";
  }

  /** Bring existing code review threads in line with the setting; new ones are spawned with it. */
  async function applyCodeReviewThreadVisibility(hidden: boolean): Promise<void> {
    for (const { thread_id: threadId } of stmts.codeReviewThreadIds.all()) {
      try {
        await bb.sdk.threads.update({ threadId, visibility: hidden ? "hidden" : "visible" });
      } catch (error) {
        bb.log.warn(`could not set visibility of code review thread ${threadId}: ${String(error)}`);
      }
    }
    await bb.storage.kv.set(CODE_REVIEW_THREADS_HIDDEN_KEY, hidden);
  }

  async function reconcileOnLoad(): Promise<void> {
    const hidden = (await settings.get()).hideReviewThreads;
    if ((await bb.storage.kv.get<boolean>(CODE_REVIEW_THREADS_HIDDEN_KEY)) !== hidden) void applyCodeReviewThreadVisibility(hidden);
  }

  return { codeReviewThreads, codeReviewThreadVisibility, applyCodeReviewThreadVisibility, reconcileOnLoad };
}

export type CodeReviewThreads = ReturnType<typeof createCodeReviewThreads>;
