import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { PullRequest } from "../../shared/board";
import type { CommentApplyRow, DiffCommentRow, DumpRow, HunkExplanationRow, NarrativeRow, PrCommentRow, ReviewRow, TicketRow } from "./rows";

export type KanbanDatabase = ReturnType<BbPluginApi["storage"]["database"]>;

export function prepareStatements(db: KanbanDatabase) {
  return {
    all: db.prepare<[], TicketRow>(
      `SELECT * FROM tickets ORDER BY column_id, position, created_at`,
    ),
    byId: db.prepare<[string], TicketRow>(`SELECT * FROM tickets WHERE id = ?`),
    byThread: db.prepare<[string], TicketRow>(
      `SELECT * FROM tickets WHERE thread_id = ? LIMIT 1`,
    ),
    byPr: db.prepare<[string, number], TicketRow>(
      `SELECT * FROM tickets WHERE pr_repo = ? AND pr_number = ?`,
    ),
    openPrs: db.prepare<[], TicketRow>(
      `SELECT * FROM tickets WHERE kind = 'pr' AND pr_state IN ('open', 'draft')`,
    ),
    inColumn: db.prepare<[string], TicketRow>(
      `SELECT * FROM tickets WHERE column_id = ? ORDER BY position, created_at`,
    ),
    maxPosition: db.prepare<[string], { max: number | null }>(
      `SELECT MAX(position) AS max FROM tickets WHERE column_id = ?`,
    ),
    insert: db.prepare(
      `INSERT INTO tickets (id, title, description, column_id, kind, tags, source_id, thread_id, project_id, parent_id,
         pr_repo, pr_number, pr_url, pr_role, pr_state, pr_author, pr_updated_at,
         jira_key, jira_url, jira_status, jira_status_category, jira_issue_type, jira_priority, jira_assignee, jira_updated_at,
         position, created_at, updated_at)
       VALUES (@id, @title, @description, @column_id, @kind, @tags, @source_id, @thread_id, @project_id, @parent_id,
         @pr_repo, @pr_number, @pr_url, @pr_role, @pr_state, @pr_author, @pr_updated_at,
         @jira_key, @jira_url, @jira_status, @jira_status_category, @jira_issue_type, @jira_priority, @jira_assignee, @jira_updated_at,
         @position, @created_at, @updated_at)`,
    ),
    setColumn: db.prepare<[string, number, number, string]>(
      `UPDATE tickets SET column_id = ?, position = ?, updated_at = ? WHERE id = ?`,
    ),
    setPosition: db.prepare<[number, string]>(
      `UPDATE tickets SET position = ? WHERE id = ?`,
    ),
    setThread: db.prepare<[string | null, string | null, number, string]>(
      `UPDATE tickets SET thread_id = ?, project_id = COALESCE(?, project_id), updated_at = ? WHERE id = ?`,
    ),
    clearThread: db.prepare<[number, string]>(
      `UPDATE tickets SET thread_id = NULL, updated_at = ? WHERE thread_id = ?`,
    ),
    setReviewThread: db.prepare<[string | null, number, string]>(
      `UPDATE tickets SET review_thread_id = ?, updated_at = ? WHERE id = ?`,
    ),
    clearReviewThread: db.prepare<[number, string]>(
      `UPDATE tickets SET review_thread_id = NULL, updated_at = ? WHERE review_thread_id = ?`,
    ),
    setText: db.prepare<[string, string, number, string]>(
      `UPDATE tickets SET title = ?, description = ?, updated_at = ? WHERE id = ?`,
    ),
    setPr: db.prepare<
      [string, string, PullRequest["state"], PullRequest["role"], string, string, number, string]
    >(
      `UPDATE tickets SET title = ?, pr_url = ?, pr_state = ?, pr_role = ?, pr_author = ?, pr_updated_at = ?, updated_at = ? WHERE id = ?`,
    ),
    setTags: db.prepare<[string, number, string]>(`UPDATE tickets SET tags = ?, updated_at = ? WHERE id = ?`),
    byJira: db.prepare<[string], TicketRow>(`SELECT * FROM tickets WHERE jira_key = ?`),
    openJira: db.prepare<[], TicketRow>(
      `SELECT * FROM tickets WHERE kind = 'jira' AND (jira_status_category IS NULL OR jira_status_category != 'done')`,
    ),
    setJira: db.prepare<[string, string, string, string, string, string | null, string | null, string, number, string]>(
      `UPDATE tickets SET title = ?, jira_url = ?, jira_status = ?, jira_status_category = ?, jira_issue_type = ?, jira_priority = ?, jira_assignee = ?, jira_updated_at = ?, updated_at = ? WHERE id = ?`,
    ),
    remove: db.prepare<[string]>(`DELETE FROM tickets WHERE id = ?`),
    moveColumn: db.prepare<[string, number, string]>(
      `UPDATE tickets SET column_id = ?, updated_at = ? WHERE column_id = ?`,
    ),
    reviewsForTicket: db.prepare<[string], ReviewRow>(
      `SELECT * FROM reviews WHERE ticket_id = ? ORDER BY created_at DESC, rowid DESC`,
    ),
    latestReview: db.prepare<[string], ReviewRow>(
      `SELECT * FROM reviews WHERE ticket_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    ),
    latestCompletedReview: db.prepare<[string], ReviewRow>(
      `SELECT * FROM reviews WHERE ticket_id = ? AND status = 'completed' ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    ),
    reviewById: db.prepare<[string], ReviewRow>(`SELECT * FROM reviews WHERE id = ?`),
    unappliedFinishedReviews: db.prepare<[], ReviewRow>(`SELECT * FROM reviews WHERE status != 'running' AND apply_thread_id IS NULL`),
    codeReviewThreadIds: db.prepare<[], { thread_id: string }>(
      `SELECT thread_id FROM reviews
       UNION SELECT apply_thread_id FROM reviews WHERE apply_thread_id IS NOT NULL
       UNION SELECT thread_id FROM comment_applies
       UNION SELECT thread_id FROM narratives
       UNION SELECT thread_id FROM hunk_explanations`,
    ),
    reviewByThread: db.prepare<[string], ReviewRow>(
      `SELECT * FROM reviews WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1`,
    ),
    reviewByApplyThread: db.prepare<[string], ReviewRow>(
      `SELECT * FROM reviews WHERE apply_thread_id = ? ORDER BY created_at DESC LIMIT 1`,
    ),
    insertReview: db.prepare(
      `INSERT INTO reviews (id, ticket_id, thread_id, status, since_commit_sha, created_at)
       VALUES (@id, @ticket_id, @thread_id, 'running', @since_commit_sha, @created_at)`,
    ),
    recordReviewCommit: db.prepare<[string, string | null, string | null, string]>(
      `UPDATE reviews SET commit_sha = ?, base_ref = COALESCE(?, base_ref), head_ref = COALESCE(?, head_ref) WHERE id = ?`,
    ),
    completeReview: db.prepare<[string | null, string | null, number, string]>(
      `UPDATE reviews SET status = 'completed', body = ?, commit_sha = COALESCE(commit_sha, ?), completed_at = ? WHERE id = ?`,
    ),
    failReview: db.prepare<[string | null, number, string]>(
      `UPDATE reviews SET status = 'failed', body = ?, completed_at = ? WHERE id = ?`,
    ),
    startApply: db.prepare<[string, number, string | null, number, string]>(
      `UPDATE reviews SET apply_thread_id = ?, apply_started_at = ?, apply_finding_ids = ?, apply_push = ?, apply_completed_at = NULL, apply_pushed_commit = NULL WHERE id = ?`,
    ),
    setSelectionOverrides: db.prepare<[string | null, string]>(`UPDATE reviews SET selection_overrides = ? WHERE id = ?`),
    setFindingEdits: db.prepare<[string | null, string]>(`UPDATE reviews SET finding_edits = ? WHERE id = ?`),
    completeApply: db.prepare<[number, string | null, string]>(
      `UPDATE reviews SET apply_completed_at = ?, apply_pushed_commit = ? WHERE id = ?`,
    ),
    setApplyPushed: db.prepare<[string]>(`UPDATE reviews SET apply_push = 1 WHERE id = ?`),
    setCommentApplyPushed: db.prepare<[string]>(`UPDATE comment_applies SET push = 1 WHERE id = ?`),
    deleteReviewsForTicket: db.prepare<[string]>(`DELETE FROM reviews WHERE ticket_id = ?`),
    commentsForTicket: db.prepare<[string], PrCommentRow>(
      `SELECT * FROM pr_comments WHERE ticket_id = ? ORDER BY created_at, rowid`,
    ),
    commentById: db.prepare<[string], PrCommentRow>(`SELECT * FROM pr_comments WHERE id = ?`),
    upsertComment: db.prepare(
      `INSERT INTO pr_comments (id, ticket_id, kind, github_id, author, mine, body, path, line, review_state, in_reply_to, side, outdated, resolved, url, created_at, updated_at)
       VALUES (@id, @ticket_id, @kind, @github_id, @author, @mine, @body, @path, @line, @review_state, @in_reply_to, @side, @outdated, @resolved, @url, @created_at, @updated_at)
       ON CONFLICT(id) DO UPDATE SET author = excluded.author, mine = excluded.mine, body = excluded.body, path = excluded.path,
         line = excluded.line, review_state = excluded.review_state, side = excluded.side, outdated = excluded.outdated,
         resolved = COALESCE(excluded.resolved, pr_comments.resolved), url = excluded.url, updated_at = excluded.updated_at`,
    ),
    deleteStaleComments: db.prepare<[string, string]>(
      `DELETE FROM pr_comments WHERE ticket_id = ? AND id NOT IN (SELECT value FROM json_each(?))`,
    ),
    deleteCommentsForTicket: db.prepare<[string]>(`DELETE FROM pr_comments WHERE ticket_id = ?`),
    setCommentSelected: db.prepare<[number | null, string]>(`UPDATE pr_comments SET selected = ? WHERE id = ?`),
    setCommentAddressed: db.prepare<[number | null, string]>(`UPDATE pr_comments SET addressed_at = ? WHERE id = ?`),
    markCommentsAddressed: db.prepare<[number, string]>(
      `UPDATE pr_comments SET addressed_at = ?, selected = NULL WHERE id IN (SELECT value FROM json_each(?)) AND addressed_at IS NULL`,
    ),
    setCommentsSyncedFor: db.prepare<[string | null, string]>(`UPDATE tickets SET comments_synced_for = ? WHERE id = ?`),
    commentAppliesForTicket: db.prepare<[string], CommentApplyRow>(
      `SELECT * FROM comment_applies WHERE ticket_id = ? ORDER BY started_at DESC`,
    ),
    commentApplyByThread: db.prepare<[string], CommentApplyRow>(
      `SELECT * FROM comment_applies WHERE thread_id = ? ORDER BY started_at DESC LIMIT 1`,
    ),
    commentApplyById: db.prepare<[string], CommentApplyRow>(`SELECT * FROM comment_applies WHERE id = ?`),
    insertCommentApply: db.prepare(
      `INSERT INTO comment_applies (id, ticket_id, thread_id, comment_ids, started_at, push) VALUES (@id, @ticket_id, @thread_id, @comment_ids, @started_at, @push)`,
    ),
    completeCommentApply: db.prepare<[number, string | null, string]>(
      `UPDATE comment_applies SET completed_at = ?, pushed_commit = ? WHERE id = ?`,
    ),
    deleteCommentAppliesForTicket: db.prepare<[string]>(`DELETE FROM comment_applies WHERE ticket_id = ?`),
    diffCommentsForTicket: db.prepare<[string], DiffCommentRow>(`SELECT * FROM diff_comments WHERE ticket_id = ? ORDER BY path, line, created_at`),
    pendingDiffComments: db.prepare<[string], DiffCommentRow>(
      `SELECT * FROM diff_comments WHERE ticket_id = ? AND target = 'local' AND author IS NULL AND addressed_at IS NULL AND apply_id IS NULL ORDER BY path, line, created_at`,
    ),
    githubDraftComments: db.prepare<[string], DiffCommentRow>(
      `SELECT * FROM diff_comments WHERE ticket_id = ? AND target = 'github' AND author IS NULL AND posted_at IS NULL ORDER BY created_at, rowid`,
    ),
    pendingDiffCommentCount: db.prepare<[string], { n: number }>(
      `SELECT COUNT(*) AS n FROM diff_comments WHERE ticket_id = ? AND author IS NULL
         AND ((target = 'local' AND addressed_at IS NULL AND apply_id IS NULL) OR (target = 'github' AND posted_at IS NULL))`,
    ),
    diffCommentRepliesTo: db.prepare<[string, string], DiffCommentRow>(
      `SELECT * FROM diff_comments WHERE ticket_id = ? AND in_reply_to = ? ORDER BY created_at, rowid`,
    ),
    repointDiffCommentReplies: db.prepare<[string, string]>(`UPDATE diff_comments SET in_reply_to = ? WHERE in_reply_to = ?`),
    diffCommentById: db.prepare<[string], DiffCommentRow>(`SELECT * FROM diff_comments WHERE id = ?`),
    diffCommentByGithubId: db.prepare<[string, string], DiffCommentRow>(`SELECT * FROM diff_comments WHERE ticket_id = ? AND github_comment_id = ? LIMIT 1`),
    diffCommentByAnyGithubId: db.prepare<[string], DiffCommentRow>(`SELECT * FROM diff_comments WHERE github_comment_id = ? LIMIT 1`),
    insertDiffComment: db.prepare(
      `INSERT INTO diff_comments (id, ticket_id, path, line, side, body, target, in_reply_to, author, author_thread_id, created_at, updated_at)
       VALUES (@id, @ticket_id, @path, @line, @side, @body, @target, @in_reply_to, @author, @author_thread_id, @created_at, @updated_at)`,
    ),
    updateDiffComment: db.prepare<[string, number | null, string, number, string]>(`UPDATE diff_comments SET body = ?, line = ?, target = ?, updated_at = ? WHERE id = ?`),
    deleteDiffComment: db.prepare<[string, string]>(`DELETE FROM diff_comments WHERE id = ? OR in_reply_to = ?`),
    deleteDiffCommentsForTicket: db.prepare<[string]>(`DELETE FROM diff_comments WHERE ticket_id = ?`),
    viewedPathsForHead: db.prepare<[string, string], { path: string }>(`SELECT path FROM diff_viewed WHERE ticket_id = ? AND head_sha = ? ORDER BY path`),
    upsertViewed: db.prepare<[string, string, string, number]>(
      `INSERT INTO diff_viewed (ticket_id, path, head_sha, viewed_at) VALUES (?, ?, ?, ?) ON CONFLICT(ticket_id, path) DO UPDATE SET head_sha = excluded.head_sha, viewed_at = excluded.viewed_at`,
    ),
    deleteViewed: db.prepare<[string, string]>(`DELETE FROM diff_viewed WHERE ticket_id = ? AND path = ?`),
    deleteViewedForTicket: db.prepare<[string]>(`DELETE FROM diff_viewed WHERE ticket_id = ?`),
    moveDiffComments: db.prepare<[string, string]>(`UPDATE diff_comments SET ticket_id = ? WHERE ticket_id = ?`),
    unprojectedPrsForRepo: db.prepare<[string], TicketRow>(`SELECT * FROM tickets WHERE pr_repo = ? AND project_id IS NULL AND thread_id IS NULL`),
    setProjectIfUnset: db.prepare<[string, number, string]>(`UPDATE tickets SET project_id = ?, updated_at = ? WHERE id = ? AND project_id IS NULL`),
    moveViewed: db.prepare<[string, string]>(`UPDATE diff_viewed SET ticket_id = ? WHERE ticket_id = ?`),
    insertNarrative: db.prepare(
      `INSERT INTO narratives (id, ticket_id, thread_id, status, head_sha, created_at) VALUES (@id, @ticket_id, @thread_id, 'running', @head_sha, @created_at)`,
    ),
    latestNarrative: db.prepare<[string], NarrativeRow>(`SELECT * FROM narratives WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 1`),
    narrativesForTicket: db.prepare<[string], NarrativeRow>(`SELECT * FROM narratives WHERE ticket_id = ? ORDER BY created_at DESC`),
    narrativeByThread: db.prepare<[string], NarrativeRow>(`SELECT * FROM narratives WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1`),
    completeNarrative: db.prepare<[string | null, number, string]>(`UPDATE narratives SET status = 'completed', body = ?, completed_at = ? WHERE id = ?`),
    failNarrative: db.prepare<[string | null, number, string]>(`UPDATE narratives SET status = 'failed', body = ?, completed_at = ? WHERE id = ?`),
    deleteNarrativesForTicket: db.prepare<[string]>(`DELETE FROM narratives WHERE ticket_id = ?`),
    moveNarratives: db.prepare<[string, string]>(`UPDATE narratives SET ticket_id = ? WHERE ticket_id = ?`),
    insertExplanation: db.prepare(
      `INSERT INTO hunk_explanations (id, ticket_id, path, side, start_line, end_line, head_sha, thread_id, status, created_at)
       VALUES (@id, @ticket_id, @path, @side, @start_line, @end_line, @head_sha, @thread_id, 'running', @created_at)`,
    ),
    explanationsForHead: db.prepare<[string, string | null], HunkExplanationRow>(
      `SELECT * FROM hunk_explanations WHERE ticket_id = ? AND head_sha IS ? ORDER BY created_at`,
    ),
    explanationsForTicket: db.prepare<[string], HunkExplanationRow>(`SELECT * FROM hunk_explanations WHERE ticket_id = ? ORDER BY created_at DESC`),
    explanationByThread: db.prepare<[string], HunkExplanationRow>(`SELECT * FROM hunk_explanations WHERE thread_id = ? LIMIT 1`),
    completeExplanation: db.prepare<[string | null, number, string]>(`UPDATE hunk_explanations SET status = 'completed', body = ?, completed_at = ? WHERE id = ?`),
    failExplanation: db.prepare<[string | null, number, string]>(`UPDATE hunk_explanations SET status = 'failed', body = ?, completed_at = ? WHERE id = ?`),
    deleteExplanationsForTicket: db.prepare<[string]>(`DELETE FROM hunk_explanations WHERE ticket_id = ?`),
    moveExplanations: db.prepare<[string, string]>(`UPDATE hunk_explanations SET ticket_id = ? WHERE ticket_id = ?`),
    viewedHeads: db.prepare<[string], { head_sha: string; viewed_at: number }>(`SELECT head_sha, MAX(viewed_at) AS viewed_at FROM diff_viewed WHERE ticket_id = ? GROUP BY head_sha ORDER BY viewed_at DESC`),
    viewedPathsNotForHead: db.prepare<[string, string], { path: string; head_sha: string }>(`SELECT path, head_sha FROM diff_viewed WHERE ticket_id = ? AND head_sha != ?`),
    markDiffCommentPosted: db.prepare<[number, string | null, string | null, string]>(`UPDATE diff_comments SET posted_at = ?, posted_url = ?, github_comment_id = ? WHERE id = ?`),
    assignDiffCommentsApply: db.prepare<[string, string]>(
      `UPDATE diff_comments SET apply_id = ? WHERE id IN (SELECT value FROM json_each(?))`,
    ),
    markDiffCommentsAddressedByApply: db.prepare<[number, string]>(`UPDATE diff_comments SET addressed_at = ? WHERE apply_id = ? AND addressed_at IS NULL`),
    childrenOf: db.prepare<[string], TicketRow>(`SELECT * FROM tickets WHERE parent_id = ? ORDER BY position, created_at`),
    setParent: db.prepare<[string | null, number, string]>(`UPDATE tickets SET parent_id = ?, updated_at = ? WHERE id = ?`),
    detachChildren: db.prepare<[number, string]>(`UPDATE tickets SET parent_id = NULL, updated_at = ? WHERE parent_id = ?`),
    dumpsOpen: db.prepare<[], DumpRow>(`SELECT * FROM dumps WHERE status IN ('planning', 'ready', 'failed') ORDER BY created_at DESC`),
    dumpsAll: db.prepare<[], DumpRow>(`SELECT * FROM dumps ORDER BY created_at DESC LIMIT 200`),
    dumpById: db.prepare<[string], DumpRow>(`SELECT * FROM dumps WHERE id = ?`),
    dumpByThread: db.prepare<[string], DumpRow>(`SELECT * FROM dumps WHERE thread_id = ?`),
    insertDump: db.prepare(
      `INSERT INTO dumps (id, text, project_id, thread_id, status, created_at, updated_at) VALUES (@id, @text, @project_id, @thread_id, 'planning', @created_at, @updated_at)`,
    ),
    setDumpThread: db.prepare<[string, number, string]>(`UPDATE dumps SET thread_id = ?, updated_at = ? WHERE id = ?`),
    setDumpProposal: db.prepare<[string, number, string]>(`UPDATE dumps SET status = 'ready', proposal_json = ?, error = NULL, updated_at = ? WHERE id = ?`),
    setDumpFailed: db.prepare<[string, number, string]>(`UPDATE dumps SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`),
    setDumpPlanning: db.prepare<[string, number, string]>(`UPDATE dumps SET status = 'planning', answers_json = ?, error = NULL, updated_at = ? WHERE id = ?`),
    setDumpDone: db.prepare<[string, number, string]>(`UPDATE dumps SET status = 'done', created_ticket_ids = ?, updated_at = ? WHERE id = ?`),
    setDumpDiscarded: db.prepare<[number, string]>(`UPDATE dumps SET status = 'discarded', updated_at = ? WHERE id = ?`),
  };
}

export type Statements = ReturnType<typeof prepareStatements>;
