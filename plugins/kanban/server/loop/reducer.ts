// The monitored review loop as a pure function: no I/O, no clock. The loop service feeds it events from threads, the
// CLI and the board, stores the state it returns, and carries out its actions.
import { COLUMN } from "../../shared/columns";
import { LOOP_ROUND_CAP, unansweredFindings, type CheckCommand, type Evidence, type FindingAnswer, type LoopFinding, type LoopState, type NeedsYouReason } from "../../shared/loop";
import type { Finding, ReviewDepth } from "../../shared/review";

/** Failing checks in a row that stop the loop rather than go back to the card's thread. */
const CHECK_FAILURES_TO_ESCALATE = 2;

/** What the loop reads of a review's finding to route it. */
export type ReviewedFinding = LoopFinding &
  Pick<Finding, "preExisting" | "carriedFrom"> & { triage: Pick<NonNullable<Finding["triage"]>, "decision"> | null; dispute: Pick<NonNullable<Finding["dispute"]>, "outcome"> | null };

export type LoopEvent =
  | { type: "monitor"; hasThread: boolean }
  | { type: "unmonitor" }
  /** The card's thread committed its work and says it's verified. */
  | { type: "ready"; commit: string; evidence: Evidence; checkCommand: CheckCommand }
  | { type: "checks-result"; commit: string; exitCode: number; outputTail: string }
  | { type: "review-started"; reviewId: string }
  /** The card's thread answers findings of the round it is fixing, by finding id. */
  | { type: "answer"; answers: Record<string, FindingAnswer> }
  /** `findings` are the report's own, without the ones its verifier filtered out. */
  | { type: "review-completed"; reviewId: string; findings: ReviewedFinding[] }
  /** A thread the loop started went idle without recording its result. */
  | { type: "thread-failed"; role: "checks"; commit: string }
  /** `reviewId` is null for a review that couldn't be started. */
  | { type: "thread-failed"; role: "review"; reviewId: string | null };

/** What the card's thread is told; the service words it. */
export type CardPrompt =
  /** The thread already exists, so its instructions only pick the contract up at its next session. */
  | { kind: "monitoring" }
  | { kind: "checks-failed"; commit: string; command: string; exitCode: number; outputTail: string }
  | { kind: "fix"; round: number; reviewId: string; findingIds: string[] };

export type LoopColumn = typeof COLUMN.inProgress | typeof COLUMN.checking | typeof COLUMN.review | typeof COLUMN.done;

export type LoopAction =
  /** Add any column the loop moves cards to that the board lacks. */
  | { type: "ensure-columns" }
  | { type: "move"; column: LoopColumn }
  | { type: "spawn-checks"; commit: string; checkCommand: CheckCommand }
  /** `answers` are the last fix round's, keyed by the `<reviewId>/<findingId>` handle the re-review knows each finding by. */
  | { type: "spawn-review"; commit: string; mode: "full" | "incremental"; depth: ReviewDepth; answers: Record<string, FindingAnswer> }
  | { type: "prompt-card"; prompt: CardPrompt }
  /** The card's thread committed its answer to a fix round's findings; the disputed ones stay open. */
  | { type: "record-fix"; reviewId: string; commit: string; findingIds: string[]; disputed: string[] };

export interface LoopStep {
  state: LoopState;
  actions: LoopAction[];
}

const stay = (state: LoopState): LoopStep => ({ state, actions: [] });

function needsYou(state: LoopState, reason: NeedsYouReason): LoopStep {
  return { state: { ...state, phase: "needs-you", reason }, actions: [{ type: "move", column: COLUMN.review }] };
}

const running = (state: LoopState): boolean => state.phase === "checking" || state.phase === "reviewing";

function failuresInARow(state: LoopState): number {
  let count = 0;
  for (let index = state.checks.length - 1; index >= 0 && !state.checks[index]!.passed; index -= 1) count += 1;
  return count;
}

/**
 * Deferred, dropped and pre-existing findings never enter a round; only triage's apply does, whatever the severity. A
 * disputed finding never goes back either: an accepted dispute closed it, and a rejected one is the user's to settle.
 */
function routed(findings: ReviewedFinding[]): ReviewedFinding[] {
  return findings.filter((finding) => !finding.preExisting && finding.triage?.decision === "apply" && finding.dispute === null);
}

const loopFinding = ({ id, severity, title }: ReviewedFinding): LoopFinding => ({ id, severity, title });

function lastRoundAnswers(state: LoopState): Record<string, FindingAnswer> {
  const round = state.rounds.at(-1);
  if (round === undefined) return {};
  return Object.fromEntries(Object.entries(round.answers).map(([id, answer]) => [`${round.reviewId}/${id}`, answer]));
}

function reviewCompleted(state: LoopState, reviewId: string, findings: ReviewedFinding[]): LoopStep {
  const own = findings.filter((finding) => !finding.preExisting);
  const answers = lastRoundAnswers(state);
  if (own.some((finding) => finding.carriedFrom !== null && answers[finding.carriedFrom]?.answer === "fixed")) return needsYou(state, "not-converging");
  const rejected = own.filter((finding) => finding.dispute?.outcome === "rejected");
  if (rejected.some((finding) => finding.severity !== "minor")) return needsYou(state, "dispute");
  const keptOpen = rejected.map(loopFinding);
  const open = routed(findings);
  if (open.length === 0) return needsYou({ ...state, openFindings: keptOpen }, "clean");
  if (state.round >= LOOP_ROUND_CAP) {
    if (open.some((finding) => finding.severity !== "minor")) return needsYou(state, "cap");
    return needsYou({ ...state, openFindings: [...open.map(loopFinding), ...keptOpen] }, "clean");
  }
  const round = state.round + 1;
  const findingIds = open.map((finding) => finding.id);
  return {
    state: { ...state, phase: "fixing", reason: null, round, reviewId, rounds: [...state.rounds, { reviewId, handed: findingIds, answers: {} }] },
    actions: [
      { type: "move", column: COLUMN.inProgress },
      { type: "prompt-card", prompt: { kind: "fix", round, reviewId, findingIds } },
    ],
  };
}

export function reduce(state: LoopState, event: LoopEvent): LoopStep {
  switch (event.type) {
    case "monitor":
      if (state.monitored) return stay(state);
      return {
        // A check or review still running from before the card was unmonitored carries on.
        state: { ...state, monitored: true, phase: running(state) ? state.phase : "building", reason: null },
        actions: [{ type: "ensure-columns" }, ...(event.hasThread ? [{ type: "prompt-card" as const, prompt: { kind: "monitoring" as const } }] : [])],
      };
    case "unmonitor":
      // The loop stops after the current step, so a running check or review keeps its phase until its result arrives.
      return stay({ ...state, monitored: false, phase: running(state) ? state.phase : "idle", reason: null });
    case "checks-result": {
      if (state.phase !== "checking" || state.commit !== event.commit) return stay(state);
      const passed = event.exitCode === 0;
      const recorded = { ...state, checks: [...state.checks, { commit: event.commit, exitCode: event.exitCode, passed }] };
      if (!state.monitored) return stay({ ...recorded, phase: "idle" });
      if (passed) {
        return {
          state: { ...recorded, phase: "reviewing", reason: null, reviewId: null },
          actions: [
            state.round === 0
              ? { type: "spawn-review", commit: event.commit, mode: "full", depth: state.depth, answers: {} }
              : { type: "spawn-review", commit: event.commit, mode: "incremental", depth: state.depth, answers: lastRoundAnswers(state) },
          ],
        };
      }
      if (failuresInARow(recorded) >= CHECK_FAILURES_TO_ESCALATE) return needsYou(recorded, "checks");
      return {
        state: { ...recorded, phase: "building", reason: null },
        actions: [
          { type: "move", column: COLUMN.inProgress },
          {
            type: "prompt-card",
            prompt: { kind: "checks-failed", commit: event.commit, command: state.checkCommand?.command ?? "", exitCode: event.exitCode, outputTail: event.outputTail },
          },
        ],
      };
    }
    case "ready": {
      if (!state.monitored) return stay(state);
      if (state.phase === "checking" && state.commit === event.commit) return stay(state);
      // The service refuses such a report with the ids; this only keeps the round from completing half-answered.
      if (unansweredFindings(state).length > 0) return stay(state);
      const handed = state.phase === "fixing" && state.reviewId !== null ? state.rounds.find((round) => round.reviewId === state.reviewId) : undefined;
      return {
        state: { ...state, phase: "checking", reason: null, commit: event.commit, evidence: event.evidence, checkCommand: event.checkCommand, openFindings: [] },
        actions: [
          ...(handed === undefined
            ? []
            : [
                {
                  type: "record-fix" as const,
                  reviewId: handed.reviewId,
                  commit: event.commit,
                  findingIds: handed.handed,
                  disputed: handed.handed.filter((id) => handed.answers[id]?.answer === "disputed"),
                },
              ]),
          { type: "move", column: COLUMN.checking },
          { type: "spawn-checks", commit: event.commit, checkCommand: event.checkCommand },
        ],
      };
    }
    case "answer": {
      if (state.phase !== "fixing") return stay(state);
      const rounds = state.rounds.map((round) =>
        round.reviewId !== state.reviewId
          ? round
          : { ...round, answers: { ...round.answers, ...Object.fromEntries(Object.entries(event.answers).filter(([id]) => round.handed.includes(id))) } },
      );
      return stay({ ...state, rounds });
    }
    case "review-started":
      if (state.phase !== "reviewing" || state.reviewId !== null) return stay(state);
      return stay({ ...state, reviewId: event.reviewId });
    case "review-completed":
      if (state.phase !== "reviewing" || state.reviewId !== event.reviewId) return stay(state);
      if (!state.monitored) return stay({ ...state, phase: "idle" });
      return reviewCompleted(state, event.reviewId, event.findings);
    case "thread-failed": {
      const ours = event.role === "checks" ? state.phase === "checking" && state.commit === event.commit : state.phase === "reviewing" && state.reviewId === event.reviewId;
      if (!ours) return stay(state);
      if (!state.monitored) return stay({ ...state, phase: "idle" });
      return needsYou(state, "loop-error");
    }
  }
}
