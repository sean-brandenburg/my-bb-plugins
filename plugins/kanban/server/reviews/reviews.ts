import type { Ticket } from "../../shared/board";
import type { FindingEdit, Review, ReviewSubject } from "../../shared/review";
import { REVIEWED_COMMIT_LINE, parseReviewReport } from "../agent-output";
import type { BoardStore } from "../board";
import type { CardThreads, ThreadEnvironment } from "../card-threads";
import type { CodeReviewThreads } from "../code-review-threads";
import type { KanbanContext } from "../context";
import { rowToReview, type ReviewRow } from "../db/rows";
import type { Projects } from "../projects";
import { parseFindingEdits, parseSelection, selectedFindingsBody, standingReviews } from "./findings";
import { localApplyPrompt, prApplyPrompt, reviewPrompt } from "./prompts";
import { localSubject, prSubject, subjectLabel } from "./subject";
import { parseStringArray, shortId, threadTitle } from "../util";

const INTERIM_REVIEWS_REPAIRED_KEY = "interimReviewsRepaired";

/** Code review threads for a card's PR or local commit, the findings they persist, and the apply rounds that fix them. */
export function createReviews(
  ctx: KanbanContext,
  { board, threads, projects, codeReviewThreads }: { board: BoardStore; threads: CardThreads; projects: Projects; codeReviewThreads: CodeReviewThreads },
) {
  const { bb, stmts, publish } = ctx;
  const { getTicket } = board;
  const { freshWorktree, projectHostId } = threads;
  const { projectForTicket } = projects;
  const { codeReviewThreadVisibility } = codeReviewThreads;

  /**
   * What a review of the card covers: its pull request, or the commits its thread made beyond the branch the changes
   * view diffs against. The error says why the card can't be reviewed yet, in words the board shows as the reason.
   */
  async function reviewSubjectForTicket(ticket: Ticket): Promise<ReviewSubject> {
    if (ticket.pr !== null) return prSubject(ticket);
    if (ticket.threadId === null) throw new Error("Start the card's thread first; a review covers the commits it makes");
    const thread = await bb.sdk.threads.get({ threadId: ticket.threadId });
    if (thread.environmentId === null) throw new Error("The card's thread has no environment yet");
    const environment = await bb.sdk.environments.get({ environmentId: thread.environmentId });
    const branch = environment.mergeBaseBranch ?? environment.defaultBranch;
    if (branch === null) throw new Error("The card's environment has no default branch to review its commits against");
    // The review's fresh worktree comes from the project's checkout, so it only has commits made in that repository.
    if (environment.hostId !== (await projectHostId(thread.projectId))) {
      throw new Error("The card's thread runs on another machine than the project's checkout, so a review worktree can't see its commits");
    }
    const status = await bb.sdk.environments.status({ environmentId: environment.id, mergeBaseBranch: branch });
    if (status.outcome === "not_applicable") throw new Error(status.message);
    if (status.outcome === "unavailable") throw new Error(status.failure.message);
    const { checkout, mergeBase } = status.workspace;
    const head = checkout.kind === "branch" || checkout.kind === "detached" ? checkout.headSha : null;
    if (head === null) throw new Error("The card's thread has no commits yet");
    if (mergeBase === null || mergeBase.aheadCount === 0) throw new Error(`No commits beyond \`${branch}\` to review; commit the card's work first`);
    return localSubject(head, branch);
  }

  async function reviewAvailability(ticketId: string): Promise<{ subject: ReviewSubject | null; reason: string | null }> {
    const ticket = getTicket(ticketId);
    try {
      return { subject: await reviewSubjectForTicket(ticket), reason: null };
    } catch (error) {
      return { subject: null, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async function spawnReviewForTicket(
    ticketId: string,
    projectId: string,
    mode: "full" | "incremental",
    subject: ReviewSubject,
  ): Promise<Ticket> {
    const ticket = getTicket(ticketId);
    // A card reviewed both as a PR and locally keeps two chains; a re-review only continues the one of its own kind.
    const previousRow = mode === "incremental" ? stmts.latestCompletedReviewOfKind.get(ticket.id, subject.kind) : undefined;
    const previous = previousRow === undefined || previousRow.commit_sha === null ? null : rowToReview(previousRow);
    const standing =
      previous === null ? [] : standingReviews(stmts.reviewsForTicket.all(ticket.id).map(rowToReview).filter((review) => review.subjectKind === subject.kind));
    const thread = await bb.sdk.threads.spawn({
      projectId,
      environment: await freshWorktree(projectId),
      prompt: reviewPrompt(subject, ticket, previous, standing),
      title: threadTitle(`${previous === null ? "Review" : "Re-review"} ${subjectLabel(subject)}: ${ticket.title}`),
      ...(ticket.threadId === null ? {} : { parentThreadId: ticket.threadId }),
      visibility: await codeReviewThreadVisibility(),
      pluginMetadata: { ticketId: ticket.id, role: "review" },
    });
    const now = Date.now();
    stmts.insertReview.run({
      id: shortId(),
      ticket_id: ticket.id,
      thread_id: thread.id,
      subject_kind: subject.kind,
      since_commit_sha: previous?.commitSha ?? null,
      created_at: now,
    });
    stmts.setReviewThread.run(thread.id, now, ticket.id);
    publish();
    return getTicket(ticket.id);
  }

  async function spawnApplyForReview(ticketId: string, reviewId: string | null, push: boolean): Promise<Ticket> {
    const ticket = getTicket(ticketId);
    const row = reviewId === null ? stmts.latestCompletedReview.get(ticket.id) : stmts.reviewById.get(reviewId);
    if (row === undefined || row.ticket_id !== ticket.id) throw new Error("No completed review to apply for this card");
    if (row.status === "running") throw new Error("The review is still running");
    if (row.status === "failed") throw new Error("The review did not complete; run it again first");
    const review = rowToReview(row);
    if (review.apply !== null && review.apply.completedAt === null) {
      throw new Error("An apply run for this review is already in progress");
    }
    const { body: findingsBody, findingIds } = selectedFindingsBody(review);
    if (findingIds !== null && findingIds.length === 0) {
      throw new Error("No selected findings are left to apply; tick at least one open finding");
    }
    const handed = findingIds === null ? null : JSON.stringify(findingIds);
    if (review.subjectKind === "local") return applyInCardThread(ticket, review, findingsBody, handed);
    const subject = prSubject(ticket);
    const projectId = await projectForTicket(ticket, null);
    // Reuse the review thread's worktree when it still exists: the PR is already fetched there.
    let environment: ThreadEnvironment | null = null;
    try {
      const reviewThread = await bb.sdk.threads.get({ threadId: review.threadId });
      if (reviewThread.environmentId !== null && reviewThread.archivedAt === null) {
        environment = { type: "reuse", environmentId: reviewThread.environmentId };
      }
    } catch {
      environment = null;
    }
    const thread = await bb.sdk.threads.spawn({
      projectId,
      environment: environment ?? (await freshWorktree(projectId)),
      prompt: prApplyPrompt(subject, ticket, review, push, findingsBody),
      title: threadTitle(`Apply review ${subjectLabel(subject)}: ${ticket.title}`),
      parentThreadId: ticket.threadId ?? review.threadId,
      visibility: await codeReviewThreadVisibility(),
      pluginMetadata: { ticketId: ticket.id, role: "apply", reviewId: review.id },
    });
    stmts.startApply.run(thread.id, Date.now(), handed, push ? 1 : 0, review.id);
    publish();
    return getTicket(ticket.id);
  }

  /**
   * A local review's fixes belong on the card's branch, so the card's own thread applies them, keeping its own
   * instructions; a fresh worktree would commit them off that branch.
   */
  async function applyInCardThread(ticket: Ticket, review: Review, findingsBody: string, handed: string | null): Promise<Ticket> {
    if (ticket.threadId === null) throw new Error("The card's thread is gone, and a local review's fixes are made there; start a new thread and review again");
    await bb.sdk.threads.send({ threadId: ticket.threadId, mode: "auto", input: [{ type: "text", text: localApplyPrompt(ticket, review, findingsBody), mentions: [] }] });
    stmts.startApply.run(ticket.threadId, Date.now(), handed, 0, review.id);
    publish();
    return getTicket(ticket.id);
  }

  /** A carried finding keeps the apply-round choice the user made on the finding it came from. */
  function inheritSelections(reviewId: string): void {
    const row = stmts.reviewById.get(reviewId);
    const report = row === undefined ? null : parseReviewReport(row.body);
    if (row === undefined || report === null || !report.carriesForward) return;
    const overrides = parseSelection(row.selection_overrides);
    const sourceOverrides = new Map<string, Record<string, boolean>>();
    let changed = false;
    for (const finding of report.findings) {
      if (finding.carriedFrom === null || finding.id in overrides) continue;
      const [sourceId, sourceFindingId] = finding.carriedFrom.split("/");
      if (sourceId === undefined || sourceFindingId === undefined) continue;
      if (!sourceOverrides.has(sourceId)) {
        const source = stmts.reviewById.get(sourceId);
        sourceOverrides.set(sourceId, source === undefined || source.ticket_id !== row.ticket_id ? {} : parseSelection(source.selection_overrides));
      }
      const inherited = sourceOverrides.get(sourceId)![sourceFindingId];
      if (inherited === undefined) continue;
      overrides[finding.id] = inherited;
      changed = true;
    }
    if (changed) stmts.setSelectionOverrides.run(JSON.stringify(overrides), reviewId);
  }

  /** A review recorded from an interim message is superseded by the first later one carrying the report, until an apply round pins it. */
  function supersedeInterimReview(row: ReviewRow, text: string | null): boolean {
    const report = parseReviewReport(text);
    if (report === null || row.apply_thread_id !== null || parseReviewReport(row.body) !== null) return false;
    stmts.completeReview.run(text, report.commit, Date.now(), row.id);
    inheritSelections(row.id);
    return true;
  }

  /** Reviews finished before idles waited for background reviewers may hold an interim message; their thread's final output has the report. */
  async function repairInterimReviews(): Promise<void> {
    let repaired = 0;
    for (const row of stmts.unappliedFinishedReviews.all()) {
      if (parseReviewReport(row.body) !== null) continue;
      try {
        const { output } = await bb.sdk.threads.output({ threadId: row.thread_id });
        if (supersedeInterimReview(row, output)) repaired += 1;
      } catch (error) {
        bb.log.warn(`could not read the final output of review thread ${row.thread_id}: ${String(error)}`);
      }
    }
    await bb.storage.kv.set(INTERIM_REVIEWS_REPAIRED_KEY, true);
    if (repaired > 0) publish();
  }

  async function repairInterimReviewsOnLoad(): Promise<void> {
    if ((await bb.storage.kv.get<boolean>(INTERIM_REVIEWS_REPAIRED_KEY)) !== true) void repairInterimReviews();
  }

  /** The review thread's final idle carries the compiled report; without a report or a commit the review never ran. */
  function handleIdle(threadId: string, lastAssistantText: string | null): boolean {
    const row = stmts.reviewByThread.get(threadId);
    if (row === undefined) return false;
    const report = parseReviewReport(lastAssistantText);
    if (row.status !== "running") {
      if (supersedeInterimReview(row, lastAssistantText)) publish();
      return true;
    }
    const fromLine = lastAssistantText === null ? null : REVIEWED_COMMIT_LINE.exec(lastAssistantText)?.[1] ?? null;
    const commit = report?.commit ?? fromLine ?? row.commit_sha;
    // No report and no commit from any channel means the review never ran (setup failed, agent stopped early).
    if (report === null && commit === null) stmts.failReview.run(lastAssistantText, Date.now(), row.id);
    else {
      stmts.completeReview.run(lastAssistantText, report?.commit ?? fromLine, Date.now(), row.id);
      inheritSelections(row.id);
    }
    publish();
    return true;
  }

  function listReviews(ticketId: string): { reviews: Review[] } {
    return { reviews: stmts.reviewsForTicket.all(ticketId).map(rowToReview) };
  }

  function setSelection(reviewId: string, findingId: string, selected: boolean): Review {
    const row = stmts.reviewById.get(reviewId);
    if (row === undefined) throw new Error(`No review with id ${reviewId}`);
    const review = rowToReview(row);
    if (review.report === null || !review.report.findings.some((finding) => finding.id === findingId)) {
      throw new Error(`Review ${reviewId} has no finding ${findingId}`);
    }
    const overrides = { ...review.selectionOverrides, [findingId]: selected };
    stmts.setSelectionOverrides.run(JSON.stringify(overrides), reviewId);
    publish();
    return rowToReview(stmts.reviewById.get(reviewId)!);
  }

  /** Ends the review's apply round: the findings it was handed are fixed, except the ones it reports it could not apply. */
  function completeApply(row: ReviewRow, commit: string | null, pushed: boolean, skipped: readonly string[]): number {
    stmts.completeApply.run(Date.now(), commit, row.id);
    if (pushed) stmts.setApplyPushed.run(row.id);
    const handed = row.apply_finding_ids === null ? [] : parseStringArray(row.apply_finding_ids);
    const fixed = handed.filter((id) => !skipped.includes(id));
    const applied = new Set([...(row.applied_finding_ids === null ? [] : parseStringArray(row.applied_finding_ids)), ...fixed]);
    stmts.setAppliedFindingIds.run(applied.size === 0 ? null : JSON.stringify([...applied]), row.id);
    publish();
    return fixed.length;
  }

  function setApplied(reviewId: string, findingId: string, applied: boolean): Review {
    const row = stmts.reviewById.get(reviewId);
    if (row === undefined) throw new Error(`No review with id ${reviewId}`);
    const review = rowToReview(row);
    if (review.report === null || !review.report.findings.some((finding) => finding.id === findingId)) {
      throw new Error(`Review ${reviewId} has no finding ${findingId}`);
    }
    const ids = new Set(review.appliedFindingIds);
    if (applied) ids.add(findingId);
    else ids.delete(findingId);
    stmts.setAppliedFindingIds.run(ids.size === 0 ? null : JSON.stringify([...ids]), reviewId);
    publish();
    return rowToReview(stmts.reviewById.get(reviewId)!);
  }

  function resetSelection(reviewId: string): Review {
    const row = stmts.reviewById.get(reviewId);
    if (row === undefined) throw new Error(`No review with id ${reviewId}`);
    stmts.setSelectionOverrides.run(null, reviewId);
    publish();
    return rowToReview(stmts.reviewById.get(reviewId)!);
  }

  function editFinding(reviewId: string, findingId: string, edit: FindingEdit | null): Review {
    const row = stmts.reviewById.get(reviewId);
    if (row === undefined) throw new Error(`No review with id ${reviewId}`);
    const original = parseReviewReport(row.body);
    if (original === null || !original.findings.some((finding) => finding.id === findingId)) {
      throw new Error(`Review ${reviewId} has no finding ${findingId}`);
    }
    const edits = parseFindingEdits(row.finding_edits);
    if (edit === null) delete edits[findingId];
    else edits[findingId] = { ...edits[findingId], ...edit };
    stmts.setFindingEdits.run(Object.keys(edits).length === 0 ? null : JSON.stringify(edits), reviewId);
    publish();
    return rowToReview(stmts.reviewById.get(reviewId)!);
  }

  return { reviewSubjectForTicket, reviewAvailability, spawnReviewForTicket, spawnApplyForReview, repairInterimReviewsOnLoad, handleIdle, listReviews, setSelection, resetSelection, editFinding, completeApply, setApplied };
}

export type Reviews = ReturnType<typeof createReviews>;
