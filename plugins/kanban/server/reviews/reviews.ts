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
import { earlierFindings, parseFindingEdits, parseSelection, selectedFindingsBody, standingReviews } from "./findings";
import { shortId, threadTitle } from "../util";

const INTERIM_REVIEWS_REPAIRED_KEY = "interimReviewsRepaired";

/**
 * The code-review skill diffs `<default-branch>...HEAD` and its reviewers read
 * whole files, so the PR head has to be checked out locally. The review runs
 * in its own worktree and checks the PR out detached, so it never touches the
 * branch checked out in the main project directory.
 */
function reviewPrompt(ticket: Ticket, since: Review | null, standing: Review[]): string {
  if (ticket.pr === null) throw new Error("Only PR cards can be reviewed");
  const { repo, number, url } = ticket.pr;
  const sinceSha = since?.commitSha ?? null;
  const range = sinceSha === null ? "origin/$BASE...HEAD" : `${sinceSha}..HEAD`;
  return [
    sinceSha === null
      ? `Run a full code review of pull request ${repo}#${number}: "${ticket.title}" (${url}).`
      : `Re-review pull request ${repo}#${number}: "${ticket.title}" (${url}). The previous review covered commit ${sinceSha}. Review what changed since then, and re-check the earlier findings listed at the end of this prompt so every one still unaddressed carries forward into this review.`,
    "",
    "Setup (this worktree is disposable; do not touch any other checkout). The `gh` and `git fetch` steps need your GitHub credentials, which the sandbox hides; running them with the sandbox disabled is expected and authorized here, so do that rather than stopping to ask.",
    `1. \`BASE=$(gh pr view ${number} --repo ${repo} --json baseRefName --jq .baseRefName)\` and \`HEAD_REF=$(gh pr view ${number} --repo ${repo} --json headRefName --jq .headRefName)\``,
    `2. \`git fetch origin "$BASE" "pull/${number}/head"\``,
    "3. `git checkout --detach FETCH_HEAD`",
    '4. `bb kanban review-record --commit "$(git rev-parse HEAD)" --base "$BASE" --head "$HEAD_REF"` so the board knows which commit this review covers.',
    "",
    ...(sinceSha === null
      ? [
          `Then invoke the \`code-review\` skill with the range \`${range}\` (three-dot) so it reviews exactly the PR's changes. Let it spawn every applicable reviewer in parallel and compile the findings in its standard format.`,
          "",
          "Your final message must be the code-review skill's compiled report verbatim, including its `Reviewed commit:` line and the trailing ```json review-findings block; it is persisted on the card and rendered from that JSON.",
        ]
      : incrementalSteps(range)),
    "Rules: do not change code, and do not post comments or reviews on GitHub; the compiled findings in this thread are the deliverable.",
    `This review belongs to kanban ticket ${ticket.id}.`,
    ...(sinceSha === null ? [] : ["", ...earlierFindingsSection(standing)]),
  ].join("\n");
}

/** A re-review is only complete when it also says which earlier findings are still open, so the latest review alone stands for the PR. */
function incrementalSteps(range: string): string[] {
  return [
    `5. Review the new commits. If \`git log ${range}\` is empty nothing changed, so skip this step. Otherwise invoke the \`code-review\` skill with the range \`${range}\` and let it spawn its reviewers and compile their findings; that report is an intermediate result, not your final message.`,
    "6. Re-check the earlier findings at HEAD. Spawn one general-purpose subagent with them and have it read the code at HEAD and classify each as addressed (the problem no longer exists) or open (still present; give its current locations, since lines may have moved). Changed lines or an apply round that targeted a finding do not make it addressed; only the code at HEAD does. When step 5 found nothing changed, every earlier finding is open as listed and needs no check.",
    "7. Compile one merged report in the code-review skill's exact format (the markdown sections, the `Reviewed commit:` and `Range:` lines, and the trailing ```json review-findings block), with these additions:",
    "   - `findings` holds the new findings from step 5 plus every open earlier finding, merged into one where a new finding is the same problem as an earlier one, ordered by severity and renumbered `F1`, `F2`, ….",
    '   - A carried finding keeps its earlier title, description, fix, severity, scores, flaggedBy and category unless the new commits made them inaccurate, takes its locations at HEAD, and sets `"carriedFrom"` to its earlier handle; its markdown line ends with `(carried from <handle>)`. New findings set `"carriedFrom": null`. Points still open from an earlier free-form review become findings with `"carriedFrom"` set to that review\'s id.',
    '   - Set `"carriesForward": true` and list each addressed earlier finding in `"resolved"` as `{ "id": "<handle>", "title": "<earlier title>", "note": "<how it was addressed>" }`; in the markdown, list them under a `### Resolved since the last review` heading inside `## Review Findings`.',
    `   - \`"range"\` is \`${range}\` and \`"reviewers"\` lists only the reviewers step 5 ran (none when nothing changed).`,
    "",
    "Your final message must be that merged report, including its `Reviewed commit:` line and the trailing ```json review-findings block; it is persisted on the card, rendered from that JSON, and replaces the earlier reviews' findings on the board.",
  ];
}

function earlierFindingsSection(standing: Review[]): string[] {
  const findings = earlierFindings(standing);
  const freeForm = standing.filter((review) => review.report === null && review.body !== null && review.body.trim() !== "");
  const lines = ["## Earlier findings", ""];
  if (findings.length === 0 && freeForm.length === 0) return [...lines, "The earlier reviews left no open findings, so `resolved` is empty and every finding is new."];
  if (findings.length > 0) {
    lines.push(
      "Each is keyed by its `handle`; `applyRound` says what the board's apply round did with it.",
      "",
      "```json",
      JSON.stringify(findings, null, 2),
      "```",
    );
  }
  for (const review of freeForm) lines.push("", `### Free-form review ${review.id}`, "", review.body!.trim());
  return lines;
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
    const standing = previous === null ? [] : standingReviews(stmts.reviewsForTicket.all(ticket.id).map(rowToReview));
    const shortName = prShortName(ticket.pr);
    const thread = await bb.sdk.threads.spawn({
      projectId,
      environment: await freshWorktree(projectId),
      prompt: reviewPrompt(ticket, previous, standing),
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
