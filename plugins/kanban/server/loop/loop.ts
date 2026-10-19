import type { Ticket } from "../../shared/board";
import { fixingRound, parseLoopState, unansweredFindings, type CheckCommand, type Evidence, type FindingAnswer } from "../../shared/loop";
import type { BoardStore } from "../board";
import type { CardThreads } from "../card-threads";
import type { CodeReviewThreads } from "../code-review-threads";
import type { KanbanContext } from "../context";
import { rowToReview, type ChecksRunRow } from "../db/rows";
import type { ProjectSettingsStore } from "../project-settings";
import type { Reviews } from "../reviews/reviews";
import { errorMessage, shortId, threadTitle } from "../util";
import { cardPromptText, checksPrompt, fixPromptText } from "./prompts";
import { reduce, type CardPrompt, type LoopAction, type LoopEvent } from "./reducer";

/** Thrown when a ready report can't name a check command; the CLI turns it into a hint. */
export class NoCheckCommandError extends Error {}

/** Thrown when the card's thread reports a fix round ready, or answers, out of turn; the CLI shows the message as is. */
export class FindingAnswerError extends Error {}

/**
 * The monitored review loop's adapter: it turns thread events, CLI calls and board actions into reducer events,
 * stores the state the reducer returns, and carries out its actions.
 */
export function createLoop(
  ctx: KanbanContext,
  {
    board,
    threads,
    codeReviewThreads,
    projectSettings,
    reviews,
  }: { board: BoardStore; threads: CardThreads; codeReviewThreads: CodeReviewThreads; projectSettings: ProjectSettingsStore; reviews: Reviews },
) {
  const { bb, stmts, publish } = ctx;
  const { getTicket } = board;

  /** Reads, reduces and stores in one synchronous step, so two events for a card can't interleave; actions run after. */
  async function dispatch(ticketId: string, event: LoopEvent): Promise<void> {
    const row = stmts.byId.get(ticketId);
    if (row === undefined) return;
    const { state, actions } = reduce(parseLoopState(row.loop_state), event);
    stmts.setLoopState.run(JSON.stringify(state), ticketId);
    publish();
    for (const action of actions) await perform(ticketId, action);
  }

  async function perform(ticketId: string, action: LoopAction): Promise<void> {
    switch (action.type) {
      case "ensure-columns":
        await board.ensureLoopColumns();
        return;
      case "move": {
        const ticket = getTicket(ticketId);
        if (ticket.columnId === action.column) return;
        if (!(await board.getColumns()).some((column) => column.id === action.column)) return;
        board.moveTicket(ticketId, action.column, null);
        return;
      }
      case "spawn-checks":
        try {
          await spawnChecks(getTicket(ticketId), action.commit, action.checkCommand);
        } catch (error) {
          bb.log.warn(`could not start a checks thread for ticket ${ticketId}: ${errorMessage(error)}`);
          await dispatch(ticketId, { type: "thread-failed", role: "checks", commit: action.commit, threadId: null });
        }
        return;
      case "spawn-review": {
        let reviewThreadId: string | null;
        try {
          reviewThreadId = (await reviews.startReview(ticketId, null, action.mode, action.depth, action.commit, action.answers)).reviewThreadId;
        } catch (error) {
          bb.log.warn(`could not start a review for ticket ${ticketId}: ${errorMessage(error)}`);
          await dispatch(ticketId, { type: "thread-failed", role: "review", reviewId: null, threadId: null });
          return;
        }
        const review = reviewThreadId === null ? undefined : stmts.reviewByThread.get(reviewThreadId);
        if (review !== undefined) await dispatch(ticketId, { type: "review-started", reviewId: review.id });
        return;
      }
      case "prompt-card":
        await promptCard(ticketId, action.prompt);
        return;
      case "record-fix": {
        const row = stmts.reviewById.get(action.reviewId);
        if (row !== undefined) reviews.completeApply(row, action.commit, false, action.disputed);
        return;
      }
      case "end-fix": {
        const row = stmts.reviewById.get(action.reviewId);
        if (row !== undefined) reviews.completeApply(row, null, false, action.findingIds);
        return;
      }
    }
  }

  async function promptCard(ticketId: string, prompt: CardPrompt): Promise<void> {
    const ticket = getTicket(ticketId);
    if (ticket.threadId === null) return;
    let text: string;
    if (prompt.kind === "fix") {
      const row = stmts.reviewById.get(prompt.reviewId);
      if (row === undefined) return;
      const review = rowToReview(row);
      const findings = (review.report?.findings ?? []).filter((finding) => prompt.findingIds.includes(finding.id));
      text = fixPromptText(ticket, prompt.round, review.commitSha, findings);
    } else {
      text = cardPromptText(prompt, ticket, projectSettings.projectSettings(ticket.projectId).checkCommand);
    }
    try {
      await bb.sdk.threads.send({ threadId: ticket.threadId, mode: "auto", input: [{ type: "text", text, mentions: [] }] });
    } catch (error) {
      bb.log.warn(`could not prompt the thread of ticket ${ticketId}: ${errorMessage(error)}`);
      return;
    }
    // The fix round is the review's apply round, so its re-review hands the fixed findings to the scope finder.
    if (prompt.kind === "fix") {
      stmts.startApply.run(ticket.threadId, Date.now(), JSON.stringify(prompt.findingIds), 0, prompt.reviewId);
      publish();
    }
  }

  async function spawnChecks(ticket: Ticket, commit: string, checkCommand: CheckCommand): Promise<void> {
    const projectId = ticket.projectId;
    if (projectId === null) throw new Error("The card has no project to check its work in");
    const thread = await bb.sdk.threads.spawn({
      projectId,
      environment: await threads.freshWorktree(projectId),
      prompt: checksPrompt(ticket, commit, checkCommand.command),
      title: threadTitle(`Checks ${commit.slice(0, 7)}: ${ticket.title}`),
      ...(ticket.threadId === null ? {} : { parentThreadId: ticket.threadId }),
      visibility: await codeReviewThreads.codeReviewThreadVisibility(),
      pluginMetadata: { ticketId: ticket.id, role: "checks" },
    });
    stmts.insertChecksRun.run({
      id: shortId(),
      ticket_id: ticket.id,
      thread_id: thread.id,
      commit_sha: commit,
      command: checkCommand.command,
      command_source: checkCommand.source,
      created_at: Date.now(),
    });
    publish();
  }

  async function setMonitored(ticketId: string, monitored: boolean): Promise<Ticket> {
    const ticket = getTicket(ticketId);
    await dispatch(ticket.id, monitored ? { type: "monitor", hasThread: ticket.threadId !== null } : { type: "unmonitor" });
    return getTicket(ticket.id);
  }

  /** The project's command when it sets one; otherwise the one the agent ran, marked as its choice. */
  function resolveCheckCommand(ticket: Ticket, agentCommand: string | null): CheckCommand {
    const projectCommand = projectSettings.projectSettings(ticket.projectId).checkCommand;
    if (projectCommand !== null) return { command: projectCommand, source: "project" };
    if (agentCommand !== null && agentCommand.trim() !== "") return { command: agentCommand.trim(), source: "agent" };
    throw new NoCheckCommandError("The project sets no check command, so the ready report has to name the one you ran");
  }

  /** The card's thread answers findings of the fix round it is in; returns the ones still unanswered. */
  async function answerFindings(ticketId: string, findingIds: string[], answer: FindingAnswer): Promise<string[]> {
    const ticket = getTicket(ticketId);
    const state = parseLoopState(stmts.byId.get(ticket.id)!.loop_state);
    const round = fixingRound(state);
    if (round === undefined) throw new FindingAnswerError(`Ticket ${ticket.id} isn't in a fix round, so there are no findings to answer.`);
    const unknown = findingIds.filter((id) => !round.handed.includes(id));
    if (unknown.length > 0) throw new FindingAnswerError(`This round handed over ${round.handed.join(", ")}; not ${unknown.join(", ")}.`);
    await dispatch(ticket.id, { type: "answer", answers: Object.fromEntries(findingIds.map((id) => [id, answer])) });
    return unansweredFindings(parseLoopState(stmts.byId.get(ticket.id)!.loop_state));
  }

  /** The card's thread reports its work committed and verified; on a monitored card the checks start. */
  async function reportReady(ticketId: string, report: { commit: string; evidence: Evidence; checkCommand: string | null }): Promise<{ ticket: Ticket; checkCommand: CheckCommand | null }> {
    const ticket = getTicket(ticketId);
    const state = parseLoopState(stmts.byId.get(ticket.id)!.loop_state);
    if (!state.monitored) return { ticket, checkCommand: null };
    const unanswered = unansweredFindings(state);
    if (unanswered.length > 0) throw new FindingAnswerError(`Answer every finding of this round first; ${unanswered.join(", ")} ${unanswered.length === 1 ? "has" : "have"} no answer.`);
    const checkCommand = resolveCheckCommand(ticket, report.checkCommand);
    await dispatch(ticket.id, { type: "ready", commit: report.commit, evidence: report.evidence, checkCommand });
    return { ticket: getTicket(ticket.id), checkCommand };
  }

  async function recordChecks(run: ChecksRunRow, exitCode: number, outputTail: string): Promise<void> {
    stmts.completeChecksRun.run(exitCode, outputTail, Date.now(), run.id);
    await dispatch(run.ticket_id, { type: "checks-result", commit: run.commit_sha, exitCode, outputTail });
  }

  /** A checks thread that goes idle without recording a result never ran the checks. */
  function handleIdle(threadId: string): boolean {
    const run = stmts.checksRunByThread.get(threadId);
    if (run === undefined) return false;
    failChecks(run);
    return true;
  }

  /** Only a run still running counts: a retried run's old thread failing late must not count as the retry failing. */
  function failChecks(run: ChecksRunRow): void {
    if (run.status !== "running") return;
    stmts.failChecksRun.run(Date.now(), run.id);
    publish();
    void dispatch(run.ticket_id, { type: "thread-failed", role: "checks", commit: run.commit_sha, threadId: run.thread_id });
  }

  /** A checks or review thread that errored or was deleted never records its result. */
  function threadFailed(threadId: string, error: string | null): void {
    const run = stmts.checksRunByThread.get(threadId);
    if (run !== undefined) {
      failChecks(run);
      return;
    }
    const review = stmts.reviewByThread.get(threadId);
    if (review === undefined || review.status !== "running") return;
    stmts.failReview.run(error, Date.now(), review.id);
    publish();
    void dispatch(review.ticket_id, { type: "thread-failed", role: "review", reviewId: review.id, threadId });
  }

  /** The card's thread waits on the user; a monitored card's loop pauses until its next ready. */
  function questionAsked(threadId: string): void {
    const row = stmts.byThread.get(threadId);
    if (row !== undefined) void dispatch(row.id, { type: "question" });
  }

  /** A review thread finished; on a monitored card its findings drive the next step. */
  async function reviewFinished(threadId: string): Promise<void> {
    const row = stmts.reviewByThread.get(threadId);
    if (row === undefined || row.status === "running") return;
    const report = row.status === "completed" ? rowToReview(row).report : null;
    if (report === null) {
      await dispatch(row.ticket_id, { type: "thread-failed", role: "review", reviewId: row.id, threadId });
      return;
    }
    const findings = report.findings.map(({ id, severity, title, preExisting, triage, carriedFrom, dispute }) => ({ id, severity, title, preExisting, triage, carriedFrom, dispute }));
    await dispatch(row.ticket_id, { type: "review-completed", reviewId: row.id, findings });
  }

  return { setMonitored, answerFindings, reportReady, recordChecks, handleIdle, threadFailed, questionAsked, reviewFinished };
}

export type Loop = ReturnType<typeof createLoop>;
