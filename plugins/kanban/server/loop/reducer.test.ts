import { describe, expect, it } from "vitest";
import { INITIAL_LOOP_STATE, type LoopState } from "../../shared/loop";
import { reduce, type LoopAction, type LoopEvent } from "./reducer";

const sha = "0123456789abcdef0123456789abcdef01234567";
const fixSha = "fedcba9876543210fedcba9876543210fedcba98";
const evidence = { commands: [{ command: "pnpm test", exitCode: 0, outputTail: "42 passed" }], screenshots: [] };
const ready = (commit = sha): LoopEvent => ({ type: "ready", commit, evidence, checkCommand: { command: "pnpm check", source: "project" } });
const checks = (exitCode: number, commit = sha): LoopEvent => ({ type: "checks-result", commit, exitCode, outputTail: exitCode === 0 ? "ok" : "1 failed" });

/** Feeds events in order and returns the final state with the actions of every step. */
function run(events: LoopEvent[], from: LoopState = INITIAL_LOOP_STATE): { state: LoopState; actions: LoopAction[][] } {
  let state = from;
  const actions: LoopAction[][] = [];
  for (const event of events) {
    const next = reduce(state, event);
    state = next.state;
    actions.push(next.actions);
  }
  return { state, actions };
}

describe("loop reducer", () => {
  it("starts building when monitored, adding the loop's columns and telling an existing thread", () => {
    const withThread = run([{ type: "monitor", hasThread: true }]);
    expect(withThread.state).toMatchObject({ monitored: true, phase: "building", reason: null });
    expect(withThread.actions[0]).toEqual([{ type: "ensure-columns" }, { type: "prompt-card", prompt: { kind: "monitoring" } }]);

    // A thread started later gets the contract in its instructions.
    expect(run([{ type: "monitor", hasThread: false }]).actions[0]).toEqual([{ type: "ensure-columns" }]);
  });

  it("checks a ready commit and moves the card to Checking", () => {
    const { state, actions } = run([{ type: "monitor", hasThread: true }, ready()]);
    expect(state).toMatchObject({ phase: "checking", commit: sha, checkCommand: { command: "pnpm check", source: "project" }, evidence });
    expect(actions[1]).toEqual([
      { type: "move", column: "checking" },
      { type: "spawn-checks", commit: sha, checkCommand: { command: "pnpm check", source: "project" } },
    ]);
  });

  it("moves passing checks to Needs you as clean", () => {
    const { state, actions } = run([{ type: "monitor", hasThread: true }, ready(), checks(0)]);
    expect(state).toMatchObject({ phase: "needs-you", reason: "clean", checks: [{ commit: sha, exitCode: 0, passed: true }] });
    expect(actions[2]).toEqual([{ type: "move", column: "review" }]);
  });

  it("sends a single failure back to the card's thread with the output, spending no review", () => {
    const { state, actions } = run([{ type: "monitor", hasThread: true }, ready(), checks(2)]);
    expect(state).toMatchObject({ phase: "building", reason: null, checks: [{ commit: sha, exitCode: 2, passed: false }] });
    expect(actions[2]).toEqual([
      { type: "move", column: "in-progress" },
      { type: "prompt-card", prompt: { kind: "checks-failed", commit: sha, command: "pnpm check", exitCode: 2, outputTail: "1 failed" } },
    ]);
  });

  it("escalates a second failure in a row with reason checks", () => {
    const { state, actions } = run([{ type: "monitor", hasThread: true }, ready(), checks(1), ready(fixSha), checks(1, fixSha)]);
    expect(state).toMatchObject({ phase: "needs-you", reason: "checks", commit: fixSha });
    expect(actions[4]).toEqual([{ type: "move", column: "review" }]);
  });

  it("counts only failures in a row: a pass in between starts the count again", () => {
    const { state } = run([{ type: "monitor", hasThread: true }, ready(), checks(1), ready(fixSha), checks(0, fixSha), ready(sha), checks(1)]);
    expect(state).toMatchObject({ phase: "building", reason: null });
  });

  it("ignores a result for a commit it is no longer checking", () => {
    const { state, actions } = run([{ type: "monitor", hasThread: true }, ready(), ready(fixSha), checks(1, sha)]);
    expect(state).toMatchObject({ phase: "checking", commit: fixSha, checks: [] });
    expect(actions[3]).toEqual([]);
  });

  it("ignores a repeated ready for the commit already being checked", () => {
    const { actions } = run([{ type: "monitor", hasThread: true }, ready(), ready()]);
    expect(actions[2]).toEqual([]);
  });

  it("escalates a checks thread that ended without a result as a loop error", () => {
    const { state, actions } = run([{ type: "monitor", hasThread: true }, ready(), { type: "thread-failed", role: "checks", commit: sha }]);
    expect(state).toMatchObject({ phase: "needs-you", reason: "loop-error" });
    expect(actions[2]).toEqual([{ type: "move", column: "review" }]);

    // The thread of a commit since superseded failing says nothing about the current one.
    expect(run([{ type: "monitor", hasThread: true }, ready(), ready(fixSha), { type: "thread-failed", role: "checks", commit: sha }]).state.phase).toBe("checking");
  });

  it("stops after the current step when unmonitored: a running check's result is kept but drives nothing", () => {
    const { state, actions } = run([{ type: "monitor", hasThread: true }, ready(), { type: "unmonitor" }, checks(1)]);
    expect(state).toMatchObject({ monitored: false, phase: "idle", reason: null, commit: sha, checks: [{ commit: sha, exitCode: 1, passed: false }] });
    expect(actions[2]).toEqual([]);
    expect(actions[3]).toEqual([]);
  });

  it("does nothing on an unmonitored card", () => {
    const { state, actions } = run([ready(), checks(0)]);
    expect(state.monitored).toBe(false);
    expect(state.phase).toBe("idle");
    expect(actions).toEqual([[], []]);
  });

  it("keeps a second monitor event from restarting a loop already running", () => {
    const { state, actions } = run([{ type: "monitor", hasThread: true }, ready(), { type: "monitor", hasThread: true }]);
    expect(state.phase).toBe("checking");
    expect(actions[2]).toEqual([]);
  });
});
