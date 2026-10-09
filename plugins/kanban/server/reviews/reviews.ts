import type { Ticket } from "../../shared/board";
import type { FindingEdit, Review } from "../../shared/review";
import { REVIEWED_COMMIT_LINE, parseReviewReport } from "../agent-output";
import { finishSteps } from "../apply-steps";
import type { BoardStore } from "../board";
import type { CardThreads, ThreadEnvironment } from "../card-threads";
import type { CodeReviewThreads } from "../code-review-threads";
import type { KanbanContext } from "../context";
import { rowToReview, type ReviewRow } from "../db/rows";
import { prShortName } from "../github";
import type { Projects } from "../projects";
import { parseFindingEdits, selectedFindingsBody } from "./findings";
import { shortId, threadTitle } from "../util";

const INTERIM_REVIEWS_REPAIRED_KEY = "interimReviewsRepaired";

/**
 * The code-review skill diffs `<default-branch>...HEAD` and its reviewers read
 * whole files, so the PR head has to be checked out locally. The review runs
 * in its own worktree and checks the PR out detached, so it never touches the
 * branch checked out in the main project directory.
 */
function reviewPrompt(ticket: Ticket, since: Review | null): string {
  if (ticket.pr === null) throw new Error("Only PR cards can be reviewed");
  const { repo, number, url } = ticket.pr;
  const sinceSha = since?.commitSha ?? null;
  const range = sinceSha === null ? "origin/$BASE...HEAD" : `${sinceSha}..HEAD`;
  return [
    sinceSha === null
      ? `Run a full code review of pull request ${repo}#${number}: "${ticket.title}" (${url}).`
      : `Review the new commits on pull request ${repo}#${number}: "${ticket.title}" (${url}). The previous review covered commit ${sinceSha}; only review what changed since then.`,
    "",
    "Setup (this worktree is disposable; do not touch any other checkout). The `gh` and `git fetch` steps need your GitHub credentials, which the sandbox hides; running them with the sandbox disabled is expected and authorized here, so do that rather than stopping to ask.",
    `1. \`BASE=$(gh pr view ${number} --repo ${repo} --json baseRefName --jq .baseRefName)\` and \`HEAD_REF=$(gh pr view ${number} --repo ${repo} --json headRefName --jq .headRefName)\``,
    `2. \`git fetch origin "$BASE" "pull/${number}/head"\``,
    "3. `git checkout --detach FETCH_HEAD`",
    '4. `bb kanban review-record --commit "$(git rev-parse HEAD)" --base "$BASE" --head "$HEAD_REF"` so the board knows which commit this review covers.',
    "",
    sinceSha === null
      ? `Then invoke the \`code-review\` skill with the range \`${range}\` (three-dot) so it reviews exactly the PR's changes. Let it spawn every applicable reviewer in parallel and compile the findings in its standard format.`
      : `If \`git log ${sinceSha}..HEAD\` is empty, say that nothing changed since the last review and stop. Otherwise invoke the \`code-review\` skill with the range \`${range}\` so it reviews only the new commits, and compile the findings in its standard format.`,
    "",
    "Your final message must be the code-review skill's compiled report verbatim, including its `Reviewed commit:` line and the trailing ```json review-findings block; it is persisted on the card and rendered from that JSON.",
    "Rules: do not change code, and do not post comments or reviews on GitHub; the compiled findings in this thread are the deliverable.",
    `This review belongs to kanban ticket ${ticket.id}.`,
  ].join("\n");
}

function applyPrompt(ticket: Ticket, review: Review, autoApprove: boolean, push: boolean, findingsBody: string): string {
  if (ticket.pr === null) throw new Error("Only PR cards can be reviewed");
  const { repo, number, url } = ticket.pr;
  const headRef = review.headRef ?? `$(gh pr view ${number} --repo ${repo} --json headRefName --jq .headRefName)`;
  return [
    `Apply the persisted code review to pull request ${repo}#${number}: "${ticket.title}" (${url})${push ? " and push the fixes to its branch" : " as a local commit in this worktree"}.`,
    "",
    "Setup (this worktree is disposable; do not touch any other checkout). `git fetch`, `git push`, and `gh` need your credentials, which the sandbox hides; running them with the sandbox disabled is expected and authorized here.",
    `1. \`git fetch origin "pull/${number}/head"\` then \`git checkout --detach FETCH_HEAD\`.`,
    review.commitSha === null
      ? "2. Note `git rev-parse HEAD`."
      : `2. The review was made against commit ${review.commitSha}. If \`git rev-parse HEAD\` differs, say so and check each finding still applies before fixing it.`,
    "",
    `Then invoke the \`apply-review\` skill with the findings below.${autoApprove ? " The user has said: just apply all of it, don't ask — skip the triage confirmation." : " Run its triage step and wait for the user's go-ahead in this thread before changing anything."}`,
    "",
    ...finishSteps(push, headRef, "bb kanban review-applied", "Apply code review findings"),
    "",
    "Rules: never force-push, never post comments or reviews on GitHub, and report the result and any findings you could not apply.",
    `This apply run belongs to kanban ticket ${ticket.id}, review ${review.id}.`,
    "",
    "## Review Findings (persisted)",
    "",
    findingsBody,
  ].join("\n");
}

/** Code review threads for PR cards, the findings they persist, and the apply rounds that fix them. */
export function createReviews(
  ctx: KanbanContext,
  { board, threads, projects, codeReviewThreads }: { board: BoardStore; threads: CardThreads; projects: Projects; codeReviewThreads: CodeReviewThreads },
) {
  const { bb, stmts, publish } = ctx;
  const { getTicket } = board;
  const { freshWorktree } = threads;
  const { projectForTicket } = projects;
  const { codeReviewThreadVisibility } = codeReviewThreads;

  async function spawnReviewForTicket(
    ticketId: string,
    projectId: string,
    mode: "full" | "incremental",
  ): Promise<Ticket> {
    const ticket = getTicket(ticketId);
    if (ticket.pr === null) throw new Error("Only PR cards can be reviewed");
    const previousRow = mode === "incremental" ? stmts.latestCompletedReview.get(ticket.id) : undefined;
    const previous = previousRow === undefined || previousRow.commit_sha === null ? null : rowToReview(previousRow);
    const shortName = prShortName(ticket.pr);
    const thread = await bb.sdk.threads.spawn({
      projectId,
      environment: await freshWorktree(projectId),
      prompt: reviewPrompt(ticket, previous),
      title: threadTitle(`${previous === null ? "Review" : "Re-review"} ${shortName}: ${ticket.title}`),
      ...(ticket.threadId === null ? {} : { parentThreadId: ticket.threadId }),
      visibility: await codeReviewThreadVisibility(),
      pluginMetadata: { ticketId: ticket.id, role: "review" },
    });
    const now = Date.now();
    stmts.insertReview.run({
      id: shortId(),
      ticket_id: ticket.id,
      thread_id: thread.id,
      since_commit_sha: previous?.commitSha ?? null,
      created_at: now,
    });
    stmts.setReviewThread.run(thread.id, now, ticket.id);
    publish();
    return getTicket(ticket.id);
  }

  async function spawnApplyForReview(ticketId: string, reviewId: string | null, autoApprove: boolean, push: boolean): Promise<Ticket> {
    const ticket = getTicket(ticketId);
    if (ticket.pr === null) throw new Error("Only PR cards can be reviewed");
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
      throw new Error("No findings are selected; tick at least one finding to apply");
    }
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
      prompt: applyPrompt(ticket, review, autoApprove, push, findingsBody),
      title: threadTitle(`Apply review ${prShortName(ticket.pr)}: ${ticket.title}`),
      parentThreadId: ticket.threadId ?? review.threadId,
      visibility: await codeReviewThreadVisibility(),
      pluginMetadata: { ticketId: ticket.id, role: "apply", reviewId: review.id },
    });
    stmts.startApply.run(thread.id, Date.now(), findingIds === null ? null : JSON.stringify(findingIds), push ? 1 : 0, review.id);
    publish();
    return getTicket(ticket.id);
  }

  /** A review recorded from an interim message is superseded by the first later one carrying the report, until an apply round pins it. */
  function supersedeInterimReview(row: ReviewRow, text: string | null): boolean {
    const report = parseReviewReport(text);
    if (report === null || row.apply_thread_id !== null || parseReviewReport(row.body) !== null) return false;
    stmts.completeReview.run(text, report.commit, Date.now(), row.id);
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
    else stmts.completeReview.run(lastAssistantText, report?.commit ?? fromLine, Date.now(), row.id);
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

  return { spawnReviewForTicket, spawnApplyForReview, repairInterimReviewsOnLoad, handleIdle, listReviews, setSelection, resetSelection, editFinding };
}

export type Reviews = ReturnType<typeof createReviews>;
