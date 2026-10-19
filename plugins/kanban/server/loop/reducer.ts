// The monitored review loop as a pure function: no I/O, no clock. The loop service feeds it events from threads, the
// CLI and the board, stores the state it returns, and carries out its actions.
import { COLUMN } from "../../shared/columns";
import type { CheckCommand, Evidence, LoopState, NeedsYouReason } from "../../shared/loop";

/** Failing checks in a row that stop the loop rather than go back to the card's thread. */
const CHECK_FAILURES_TO_ESCALATE = 2;

export type LoopEvent =
  | { type: "monitor"; hasThread: boolean }
  | { type: "unmonitor" }
  /** The card's thread committed its work and says it's verified. */
  | { type: "ready"; commit: string; evidence: Evidence; checkCommand: CheckCommand }
  | { type: "checks-result"; commit: string; exitCode: number; outputTail: string }
  /** A thread the loop started went idle without recording its result. */
  | { type: "thread-failed"; role: "checks"; commit: string };

/** What the card's thread is told; the service words it. */
export type CardPrompt =
  /** The thread already exists, so its instructions only pick the contract up at its next session. */
  | { kind: "monitoring" }
  | { kind: "checks-failed"; commit: string; command: string; exitCode: number; outputTail: string };

export type LoopColumn = typeof COLUMN.inProgress | typeof COLUMN.checking | typeof COLUMN.review | typeof COLUMN.done;

export type LoopAction =
  /** Add any column the loop moves cards to that the board lacks. */
  | { type: "ensure-columns" }
  | { type: "move"; column: LoopColumn }
  | { type: "spawn-checks"; commit: string; checkCommand: CheckCommand }
  | { type: "prompt-card"; prompt: CardPrompt };

export interface LoopStep {
  state: LoopState;
  actions: LoopAction[];
}

const stay = (state: LoopState): LoopStep => ({ state, actions: [] });

function needsYou(state: LoopState, reason: NeedsYouReason): LoopStep {
  return { state: { ...state, phase: "needs-you", reason }, actions: [{ type: "move", column: COLUMN.review }] };
}

function failuresInARow(state: LoopState): number {
  let count = 0;
  for (let index = state.checks.length - 1; index >= 0 && !state.checks[index]!.passed; index -= 1) count += 1;
  return count;
}

export function reduce(state: LoopState, event: LoopEvent): LoopStep {
  switch (event.type) {
    case "monitor":
      if (state.monitored) return stay(state);
      return {
        // A check still running from before the card was unmonitored carries on.
        state: { ...state, monitored: true, phase: state.phase === "checking" ? "checking" : "building", reason: null },
        actions: [{ type: "ensure-columns" }, ...(event.hasThread ? [{ type: "prompt-card" as const, prompt: { kind: "monitoring" as const } }] : [])],
      };
    case "unmonitor":
      // The loop stops after the current step, so a running check keeps its phase until its result arrives.
      return stay({ ...state, monitored: false, phase: state.phase === "checking" ? "checking" : "idle", reason: null });
    case "checks-result": {
      if (state.phase !== "checking" || state.commit !== event.commit) return stay(state);
      const passed = event.exitCode === 0;
      const recorded = { ...state, checks: [...state.checks, { commit: event.commit, exitCode: event.exitCode, passed }] };
      if (!state.monitored) return stay({ ...recorded, phase: "idle" });
      if (passed) return needsYou(recorded, "clean");
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
    case "ready":
      if (!state.monitored) return stay(state);
      if (state.phase === "checking" && state.commit === event.commit) return stay(state);
      return {
        state: { ...state, phase: "checking", reason: null, commit: event.commit, evidence: event.evidence, checkCommand: event.checkCommand },
        actions: [
          { type: "move", column: COLUMN.checking },
          { type: "spawn-checks", commit: event.commit, checkCommand: event.checkCommand },
        ],
      };
    case "thread-failed":
      if (state.phase !== "checking" || state.commit !== event.commit) return stay(state);
      if (!state.monitored) return stay({ ...state, phase: "idle" });
      return needsYou(state, "loop-error");
  }
}
