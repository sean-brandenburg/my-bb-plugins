import type { Ticket } from "../../shared/board";
import type { CommentApply, PrComment } from "../../shared/comments";
import { finishSteps } from "../apply-steps";
import type { BoardStore } from "../board";
import type { CardThreads, ThreadEnvironment } from "../card-threads";
import type { CodeReviewThreads } from "../code-review-threads";
import type { KanbanContext } from "../context";
import { rowToComment, rowToCommentApply, type CommentApplyRow, type TicketRow } from "../db/rows";
import { githubPages, prShortName, reviewThreadResolution, type GithubIssueComment, type GithubReview, type GithubReviewComment } from "../github";
import type { Projects } from "../projects";
import { locationLabel } from "bb-diff-view/line-range";
import { parseStringArray, shortId, threadTitle } from "../util";

export function commentsBody(ticket: Ticket, comments: PrComment[]): string {
  const label = (comment: PrComment) =>
    comment.kind === "review-comment"
      ? `${locationLabel(comment.path ?? "?", comment)}${comment.id.startsWith("local:") ? " (left on the Kanban diff view)" : ""}`
      : comment.kind === "review"
        ? `review summary (${comment.reviewState ?? "COMMENTED"})`
        : "conversation";
  const lines = [
    `${comments.length} comment${comments.length === 1 ? "" : "s"} on ${ticket.pr !== null ? `${ticket.pr.repo}#${ticket.pr.number}` : `kanban ticket ${ticket.id}`} were selected on the Kanban board; others were deliberately left out.`,
    "",
  ];
  for (const comment of comments) {
    lines.push(`### ${comment.id} — ${comment.author} on ${label(comment)}${comment.inReplyTo === null ? "" : ` (reply to ${comment.inReplyTo})`}`);
    lines.push(comment.url, "", comment.body.trim(), "");
  }
  lines.push(
    "```json pr-comments",
    JSON.stringify(
      {
        version: 1,
        repo: ticket.pr?.repo,
        number: ticket.pr?.number,
        comments: comments.map(({ selected, selectionOverride, addressedAt, ticketId, githubId, mine, updatedAt, ...rest }) => rest),
      },
      null,
      2,
    ),
    "```",
  );
  return lines.join("\n");
}

export function applyCommentsPrompt(ticket: Ticket, apply: { id: string }, push: boolean, body: string): string {
  const { repo, number, url } = ticket.pr ?? { repo: null, number: null, url: null };
  const intro =
    ticket.pr !== null
      ? `Address the review comments on pull request ${repo}#${number}: "${ticket.title}" (${url})${push ? " and push the fixes to its branch" : " as a local commit in this worktree"}.`
      : `Address the review comments the user left on the changes for "${ticket.title}" (kanban ticket ${ticket.id})${push ? " and push the branch" : " as a local commit"}.`;
  const setup =
    ticket.pr !== null
      ? [
          "Setup (this worktree is disposable; do not touch any other checkout). `git fetch`, `git push`, and `gh` need your credentials, which the sandbox hides; running them with the sandbox disabled is expected and authorized here.",
          `1. \`HEAD_REF=$(gh pr view ${number} --repo ${repo} --json headRefName --jq .headRefName)\``,
          `2. \`git fetch origin "pull/${number}/head"\` then \`git checkout --detach FETCH_HEAD\`.`,
        ]
      : [
          "You are in the card's own environment, on the branch the changes live on. `HEAD_REF=$(git rev-parse --abbrev-ref HEAD)`. `git push` needs your credentials, which the sandbox hides; running it unsandboxed is authorized.",
        ];
  return [
    intro,
    "",
    ...setup,
    "",
    "Then invoke the `apply-pr-comments` skill with the comments below. The user chose them on the Kanban board, so they are already triaged: apply every one as written, without a triage step, a confirmation, or dropping any. Report any you could not apply and why.",
    "",
    ...finishSteps(push, '"$HEAD_REF"', "bb kanban comments-applied", "Address review comments"),
    "",
    "Then answer each inline comment (ids starting `local:` or `review-comment:`) in its thread on the board: `bb kanban comment-reply <id> \"<one or two sentences: what you changed, or why you did not>\"`. These replies stay on the Kanban board next to the line; they are not posted to GitHub.",
    "",
    "Rules: never force-push, never post replies or reviews on GitHub, and report what you applied, what you answered, and what you left for the user.",
    `This apply run belongs to kanban ticket ${ticket.id}, apply ${apply.id}.`,
    "",
    "## Selected comments",
    "",
    body,
  ].join("\n");
}

/** Comments synced from a PR, their selection for the apply round, and the threads that address them. */
export function createPrComments(
  ctx: KanbanContext,
  { board, threads, projects, codeReviewThreads }: { board: BoardStore; threads: CardThreads; projects: Projects; codeReviewThreads: CodeReviewThreads },
) {
  const { bb, db, stmts, sync, publish } = ctx;
  const { getTicket } = board;
  const { freshWorktree } = threads;
  const { projectForTicket } = projects;
  const { codeReviewThreadVisibility } = codeReviewThreads;

  /** Pull every comment kind for one PR and replace the ticket's stored set. */
  async function syncPrComments(row: TicketRow, token: string, signal?: AbortSignal): Promise<void> {
    if (row.pr_repo === null || row.pr_number === null) return;
    const base = `/repos/${row.pr_repo}`;
    const [issueComments, reviewComments, reviews, resolvedByRoot] = await Promise.all([
      githubPages<GithubIssueComment>(`${base}/issues/${row.pr_number}/comments`, token, signal),
      githubPages<GithubReviewComment>(`${base}/pulls/${row.pr_number}/comments`, token, signal),
      githubPages<GithubReview>(`${base}/pulls/${row.pr_number}/reviews`, token, signal),
      reviewThreadResolution(row.pr_repo, row.pr_number, token, signal).catch((error: unknown) => {
        bb.log.warn(`could not read review thread state for ${row.pr_repo}#${row.pr_number}: ${String(error)}`);
        return new Map<number, boolean>();
      }),
    ]);
    const mine = (login: string) => (sync.login !== null && login === sync.login ? 1 : 0);
    const ids: string[] = [];
    const write = db.transaction(() => {
      for (const comment of issueComments) {
        const id = `issue-comment:${comment.id}`;
        ids.push(id);
        const author = comment.user?.login ?? "";
        stmts.upsertComment.run({
          id, ticket_id: row.id, kind: "issue-comment", github_id: comment.id, author, mine: mine(author),
          body: comment.body ?? "", path: null, line: null, review_state: null, in_reply_to: null,
          side: "RIGHT", start_line: null, start_side: null, outdated: 0, resolved: null, url: comment.html_url, created_at: comment.created_at, updated_at: comment.updated_at,
        });
      }
      for (const comment of reviewComments) {
        const id = `review-comment:${comment.id}`;
        ids.push(id);
        const author = comment.user?.login ?? "";
        const resolved = resolvedByRoot.get(comment.in_reply_to_id ?? comment.id);
        const startLine = (comment.line === null ? comment.original_start_line : comment.start_line) ?? null;
        stmts.upsertComment.run({
          id, ticket_id: row.id, kind: "review-comment", github_id: comment.id, author, mine: mine(author),
          body: comment.body ?? "", path: comment.path, line: comment.line ?? comment.original_line ?? null, review_state: null,
          in_reply_to: comment.in_reply_to_id === undefined ? null : `review-comment:${comment.in_reply_to_id}`,
          side: comment.side === "LEFT" ? "LEFT" : "RIGHT",
          start_line: startLine, start_side: startLine === null ? null : comment.start_side === "LEFT" ? "LEFT" : "RIGHT", outdated: comment.line === null ? 1 : 0,
          resolved: resolved === undefined ? null : resolved ? 1 : 0, url: comment.html_url, created_at: comment.created_at, updated_at: comment.updated_at,
        });
      }
      for (const review of reviews) {
        // Pending reviews are drafts nobody else can see; bodiless approvals carry no request.
        if (review.state === "PENDING" || review.submitted_at === undefined) continue;
        if ((review.body ?? "").trim() === "" && review.state !== "CHANGES_REQUESTED") continue;
        const id = `review:${review.id}`;
        ids.push(id);
        const author = review.user?.login ?? "";
        stmts.upsertComment.run({
          id, ticket_id: row.id, kind: "review", github_id: review.id, author, mine: mine(author),
          body: review.body ?? "", path: null, line: null, review_state: review.state, in_reply_to: null,
          side: "RIGHT", start_line: null, start_side: null, outdated: 0, resolved: null, url: review.html_url, created_at: review.submitted_at, updated_at: review.submitted_at,
        });
      }
      stmts.deleteStaleComments.run(row.id, JSON.stringify(ids));
      stmts.setCommentsSyncedFor.run(row.pr_updated_at, row.id);
      markSubmittedStaged(row.id, new Set(ids));
      linkPostedDrafts(row.id);
    });
    write();
  }

  /** Drafts staged in a pending review whose comments GitHub now lists as published: the review was submitted there. */
  function markSubmittedStaged(ticketId: string, synced: ReadonlySet<string>): void {
    const now = Date.now();
    for (const draft of stmts.stagedDiffComments.all(ticketId)) {
      if (draft.github_comment_id !== null && synced.has(draft.github_comment_id)) stmts.markDiffCommentPosted.run(now, draft.posted_url, draft.github_comment_id, draft.id);
    }
  }

  /**
   * Tie inline comments posted from the board to their synced copies when the post could not read the ids back
   * (read-back failed, or rows posted before ids were recorded), so each shows once and replies can follow it to GitHub.
   */
  function linkPostedDrafts(ticketId: string): void {
    const unlinked = stmts.diffCommentsForTicket
      .all(ticketId)
      .filter((comment) => comment.target === "github" && comment.author === null && comment.posted_at !== null && comment.line !== null && comment.in_reply_to === null && !(comment.github_comment_id?.startsWith("review-comment:") ?? false));
    if (unlinked.length === 0) return;
    const claimed = new Set(stmts.diffCommentsForTicket.all(ticketId).map((comment) => comment.github_comment_id).filter((id) => id !== null));
    const candidates = stmts.commentsForTicket.all(ticketId).filter((comment) => comment.kind === "review-comment" && comment.mine === 1 && comment.in_reply_to === null && !claimed.has(comment.id));
    for (const draft of unlinked) {
      const index = candidates.findIndex((comment) => comment.path === draft.path && comment.body.trim() === draft.body.trim());
      if (index === -1) continue;
      const match = candidates.splice(index, 1)[0]!;
      stmts.markDiffCommentPosted.run(draft.posted_at!, match.url, match.id, draft.id);
      stmts.repointDiffCommentReplies.run(match.id, draft.id);
    }
  }

  async function spawnApplyForComments(
    ticketId: string,
    push: boolean,
    override?: PrComment[],
  ): Promise<{ ticket: Ticket; apply: CommentApply }> {
    const ticket = getTicket(ticketId);
    if (ticket.pr === null && override === undefined) throw new Error("Only PR cards have comments");
    const selected = override ?? stmts.commentsForTicket.all(ticket.id).map(rowToComment).filter((comment) => comment.selected);
    if (selected.length === 0) throw new Error("No comments are selected; tick at least one comment to apply");
    const running = stmts.commentAppliesForTicket.all(ticket.id).find((row) => row.completed_at === null);
    if (running !== undefined) throw new Error("An apply run for this card's comments is already in progress");
    const projectId = await projectForTicket(ticket, null);
    const applyId = shortId();
    // Local comments on a thread-backed card are applied in that thread's own environment, where the changes live.
    let environment: ThreadEnvironment | null = null;
    if (ticket.pr === null && ticket.threadId !== null) {
      const cardThread = await bb.sdk.threads.get({ threadId: ticket.threadId });
      if (cardThread.environmentId !== null) environment = { type: "reuse", environmentId: cardThread.environmentId };
    }
    const shortName = ticket.pr !== null ? prShortName(ticket.pr) : ticket.id;
    const thread = await bb.sdk.threads.spawn({
      projectId,
      environment: environment ?? (await freshWorktree(projectId)),
      prompt: applyCommentsPrompt(ticket, { id: applyId }, push, commentsBody(ticket, selected)),
      title: threadTitle(`Address comments ${shortName}: ${ticket.title}`),
      ...(ticket.threadId === null ? {} : { parentThreadId: ticket.threadId }),
      visibility: await codeReviewThreadVisibility(),
      pluginMetadata: { ticketId: ticket.id, role: "apply-comments", applyId },
    });
    stmts.insertCommentApply.run({
      id: applyId,
      ticket_id: ticket.id,
      thread_id: thread.id,
      comment_ids: JSON.stringify(selected.map((comment) => comment.id)),
      started_at: Date.now(),
      push: push ? 1 : 0,
    });
    publish();
    return { ticket: getTicket(ticket.id), apply: rowToCommentApply(stmts.commentApplyById.get(applyId)!) };
  }

  function listComments(ticketId: string): { comments: PrComment[]; applies: CommentApply[] } {
    return {
      comments: stmts.commentsForTicket.all(ticketId).map(rowToComment),
      applies: stmts.commentAppliesForTicket.all(ticketId).map(rowToCommentApply),
    };
  }

  function setSelected(id: string, selected: boolean | null): PrComment {
    if (stmts.commentById.get(id) === undefined) throw new Error(`No comment with id ${id}`);
    stmts.setCommentSelected.run(selected === null ? null : selected ? 1 : 0, id);
    publish();
    return rowToComment(stmts.commentById.get(id)!);
  }

  function setAddressed(id: string, addressed: boolean): PrComment {
    if (stmts.commentById.get(id) === undefined) throw new Error(`No comment with id ${id}`);
    stmts.setCommentAddressed.run(addressed ? Date.now() : null, id);
    publish();
    return rowToComment(stmts.commentById.get(id)!);
  }

  /** The apply thread reports its commit: the comments it was given, synced and local, count as addressed. */
  function completeApply(row: CommentApplyRow, commit: string | null, pushed: boolean): number {
    const now = Date.now();
    stmts.completeCommentApply.run(now, commit, row.id);
    if (pushed) stmts.setCommentApplyPushed.run(row.id);
    stmts.markCommentsAddressed.run(now, row.comment_ids);
    stmts.markDiffCommentsAddressedByApply.run(now, row.id);
    publish();
    return parseStringArray(row.comment_ids).length;
  }

  return { syncPrComments, spawnApplyForComments, listComments, setSelected, setAddressed, completeApply };
}

export type PrComments = ReturnType<typeof createPrComments>;
