import { describe, expect, it } from "vitest";
import { INITIAL_LOOP_STATE, type FindingAnswer, type LoopState, type PathRule } from "../../shared/loop";
import { reduce, type LoopAction, type LoopEvent, type ReviewedFinding } from "./reducer";

const sha = "0123456789abcdef0123456789abcdef01234567";
const fixSha = "fedcba9876543210fedcba9876543210fedcba98";
const evidence = { commands: [{ command: "pnpm test", exitCode: 0, outputTail: "42 passed" }], screenshots: [] };
const ready = (commit = sha): LoopEvent => ({ type: "ready", commit, evidence, checkCommand: { command: "pnpm check", source: "project" } });
const checks = (exitCode: number, commit = sha): LoopEvent => ({ type: "checks-result", commit, exitCode, outputTail: exitCode === 0 ? "ok" : "1 failed" });

const finding = (
  id: string,
  severity: ReviewedFinding["severity"],
  decision: "apply" | "defer" | "drop" | null = "apply",
  preExisting = false,
  carried: Pick<ReviewedFinding, "carriedFrom" | "dispute"> = { carriedFrom: null, dispute: null },
): ReviewedFinding => ({
  id,
  severity,
  title: `Finding ${id}`,
  preExisting,
  category: null,
  triage: decision === null ? null : { decision },
  ...carried,
});
/** A finding a re-review carried forward from `handle`, with the outcome of its dispute if it had one. */
const carried = (id: string, severity: ReviewedFinding["severity"], handle: string, outcome: "accepted" | "rejected" | null = null): ReviewedFinding =>
  finding(id, severity, "apply", false, { carriedFrom: handle, dispute: outcome === null ? null : { outcome } });
const answer = (answers: Record<string, FindingAnswer>): LoopEvent => ({ type: "answer", answers });
const fixed = { answer: "fixed" } as const;
const disputed = { answer: "disputed", reason: "The cache is per-request" } as const;
const reviewed = (reviewId: string, findings: ReviewedFinding[], notCovered: string[] = []): LoopEvent => ({ type: "review-completed", reviewId, findings, notCovered, pathRules: [] });
const file = (path: string, risk: number, lines = 10) => ({ path, risk, role: "key" as const, lines, note: "" });
const classified = (risk = 2, pathRules: PathRule[] = []): LoopEvent => ({ type: "classified", commit: sha, classification: { files: [file("src/a.ts", risk)] }, pathRules });
/** A monitored card whose first ready commit passed its checks, was classified, and whose review `rev1` started. */
const reviewing: LoopEvent[] = [{ type: "monitor", hasThread: true }, ready(), checks(0), classified(3), { type: "review-started", reviewId: "rev1" }];
/** One fix round on top of `events`: the card's thread reports the fix ready, it passes its checks, and review `reviewId` starts. */
const fixedAndReviewing = (commit: string, reviewId: string): LoopEvent[] => [ready(commit), checks(0, commit), { type: "review-started", reviewId }];

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

  it("classifies a commit that passes its first checks, then reviews it in full at the depth its attention level picks", () => {
    const start: LoopEvent[] = [{ type: "monitor", hasThread: true }, ready(), checks(0)];
    const checked = run(start);
    expect(checked.state).toMatchObject({ phase: "classifying", round: 0, checks: [{ commit: sha, exitCode: 0, passed: true }] });
    expect(checked.actions[2]).toEqual([{ type: "spawn-classify", commit: sha }]);

    const glance = run([...start, classified(2)]);
    expect(glance.state).toMatchObject({ phase: "reviewing", depth: "quick", attention: { level: "glance" } });
    expect(glance.actions[3]).toEqual([{ type: "spawn-review", commit: sha, mode: "full", depth: "quick", answers: {} }]);
    expect(run([...start, classified(3)]).actions[3]).toEqual([{ type: "spawn-review", commit: sha, mode: "full", depth: "standard", answers: {} }]);
    // A path rule raises a low-risk change to Scrutinize, which adds the security review.
    expect(run([...start, classified(1, [{ glob: "src/**", level: "scrutinize" }])]).actions[3]).toEqual([{ type: "spawn-review", commit: sha, mode: "full", depth: "deep", answers: {} }]);
  });

  it("retries a classify thread that failed once, then reviews without the scores at Standard", () => {
    const failed = (threadId: string): LoopEvent => ({ type: "thread-failed", role: "classify", commit: sha, threadId });
    const start: LoopEvent[] = [{ type: "monitor", hasThread: true }, ready(), checks(0), failed("thr_k1")];
    const { state, actions } = run([...start, failed("thr_k2")]);
    expect(actions[3]).toEqual([{ type: "spawn-classify", commit: sha }]);
    expect(state).toMatchObject({ phase: "reviewing", classification: null, attention: { level: "read" }, depth: "standard", retries: 0 });
    expect(actions[4]).toEqual([{ type: "spawn-review", commit: sha, mode: "full", depth: "standard", answers: {} }]);
  });

  it("recomputes the level when the loop stops, with what the rounds and the last review showed", () => {
    const quiet = run([{ type: "monitor", hasThread: true }, ready(), checks(0), classified(2), { type: "review-started", reviewId: "rev1" }, reviewed("rev1", [])]);
    expect(quiet.state).toMatchObject({ phase: "needs-you", reason: "clean", attention: { level: "glance" } });
    const uncovered = run([{ type: "monitor", hasThread: true }, ready(), checks(0), classified(2), { type: "review-started", reviewId: "rev1" }, reviewed("rev1", [], ["the drag preview"])]);
    expect(uncovered.state.attention).toEqual({ level: "read", reasons: ["risk 2: src/a.ts", "1 thing the checks don't cover"] });
  });

  it("moves a clean first review to Needs you as clean", () => {
    const { state, actions } = run([...reviewing, reviewed("rev1", [])]);
    expect(state).toMatchObject({ phase: "needs-you", reason: "clean", round: 0, rounds: [] });
    expect(actions[5]).toEqual([{ type: "move", column: "review" }]);
  });

  it("hands only the findings triaged apply to the card's thread, whatever their severity", () => {
    const findings = [finding("F1", "minor"), finding("F2", "critical", "defer"), finding("F3", "important", "drop"), finding("F4", "important", "apply", true), finding("F5", "minor", null)];
    const { state, actions } = run([...reviewing, reviewed("rev1", findings)]);
    expect(state).toMatchObject({ phase: "fixing", round: 1, reviewId: "rev1", rounds: [{ reviewId: "rev1", handed: ["F1"] }] });
    expect(actions[5]).toEqual([
      { type: "move", column: "in-progress" },
      { type: "prompt-card", prompt: { kind: "fix", round: 1, reviewId: "rev1", findingIds: ["F1"] } },
    ]);

    // Nothing to apply is clean, even with deferred, dropped and pre-existing findings standing.
    expect(run([...reviewing, reviewed("rev1", findings.slice(1))]).state).toMatchObject({ phase: "needs-you", reason: "clean" });
  });

  it("checks and incrementally re-reviews the fix, then ends clean", () => {
    const { state, actions } = run([...reviewing, reviewed("rev1", [finding("F1", "important")]), answer({ F1: fixed }), ...fixedAndReviewing(fixSha, "rev2"), reviewed("rev2", [])]);
    expect(actions[7]).toEqual([
      { type: "record-fix", reviewId: "rev1", commit: fixSha, findingIds: ["F1"], disputed: [] },
      { type: "move", column: "checking" },
      { type: "spawn-checks", commit: fixSha, checkCommand: { command: "pnpm check", source: "project" } },
    ]);
    expect(actions[8]).toEqual([{ type: "spawn-review", commit: fixSha, mode: "incremental", depth: "standard", answers: { "rev1/F1": fixed } }]);
    expect(state).toMatchObject({ phase: "needs-you", reason: "clean", round: 1, commit: fixSha });
  });

  /** Each round's re-review finds something new, so no round repeats a finding answered fixed. */
  const threeRounds = (last: ReviewedFinding[]): LoopEvent[] => [
    ...reviewing,
    reviewed("rev1", [finding("F1", "important")]),
    answer({ F1: fixed }),
    ...fixedAndReviewing("a".repeat(40), "rev2"),
    reviewed("rev2", [finding("F1", "important")]),
    answer({ F1: fixed }),
    ...fixedAndReviewing("b".repeat(40), "rev3"),
    reviewed("rev3", [finding("F1", "minor")]),
    answer({ F1: fixed }),
    ...fixedAndReviewing("c".repeat(40), "rev4"),
    reviewed("rev4", last),
  ];

  it("escalates at the cap of three rounds while an important finding is open", () => {
    const { state, actions } = run(threeRounds([finding("F1", "important"), finding("F2", "minor")]));
    expect(state).toMatchObject({ phase: "needs-you", reason: "cap", round: 3, openFindings: [] });
    expect(state.rounds.map((round) => round.reviewId)).toEqual(["rev1", "rev2", "rev3"]);
    expect(actions.at(-1)).toEqual([{ type: "move", column: "review" }]);
  });

  it("ends clean at the cap when only minor findings are open, listing them", () => {
    const { state } = run(threeRounds([finding("F1", "minor"), finding("F2", "important", "defer")]));
    expect(state).toMatchObject({ phase: "needs-you", reason: "clean", round: 3, openFindings: [{ id: "F1", severity: "minor", title: "Finding F1" }] });
  });

  describe("answers and disputes", () => {
    const fixing: LoopEvent[] = [...reviewing, reviewed("rev1", [finding("F1", "important"), finding("F2", "minor")])];

    it("keeps the round open until every handed finding is answered, and leaves the disputed ones unfixed", () => {
      const early = run([...fixing, answer({ F1: fixed, F9: fixed }), ready(fixSha)]);
      expect(early.state).toMatchObject({ phase: "fixing", rounds: [{ answers: { F1: fixed } }] });
      expect(early.actions.at(-1)).toEqual([]);

      const { actions } = run([...fixing, answer({ F1: fixed }), answer({ F2: disputed }), ready(fixSha)]);
      expect(actions.at(-1)![0]).toEqual({ type: "record-fix", reviewId: "rev1", commit: fixSha, findingIds: ["F1", "F2"], disputed: ["F2"] });
    });

    const rereviewed = (findings: ReviewedFinding[]) => run([...fixing, answer({ F1: fixed, F2: disputed }), ...fixedAndReviewing(fixSha, "rev2"), reviewed("rev2", findings)]);

    it("closes an accepted dispute", () => {
      expect(rereviewed([]).state).toMatchObject({ phase: "needs-you", reason: "clean", openFindings: [] });
      // A re-review that still lists the settled finding doesn't send it back.
      expect(rereviewed([carried("F1", "minor", "rev1/F2", "accepted")]).state).toMatchObject({ phase: "needs-you", reason: "clean", openFindings: [] });
    });

    it("escalates a rejected dispute on a critical or important finding", () => {
      expect(rereviewed([carried("F1", "important", "rev1/F2", "rejected")]).state).toMatchObject({ phase: "needs-you", reason: "dispute" });
    });

    it("keeps a rejected minor dispute open without sending it back, through later rounds", () => {
      const settled = carried("F1", "minor", "rev1/F2", "rejected");
      expect(rereviewed([settled]).state).toMatchObject({ phase: "needs-you", reason: "clean", openFindings: [{ id: "F1", severity: "minor", title: "Finding F1" }] });

      const next = rereviewed([settled, finding("F2", "important")]);
      expect(next.state).toMatchObject({ phase: "fixing", round: 2, rounds: [{}, { reviewId: "rev2", handed: ["F2"] }] });
      const later = run([answer({ F2: fixed }), ...fixedAndReviewing("a".repeat(40), "rev3"), reviewed("rev3", [carried("F1", "minor", "rev2/F1", "rejected")])], next.state);
      expect(later.state).toMatchObject({ phase: "needs-you", reason: "clean", openFindings: [{ id: "F1" }] });
    });

    it("escalates a finding answered fixed that is still open as not converging, whatever its severity", () => {
      expect(rereviewed([carried("F1", "minor", "rev1/F1")]).state).toMatchObject({ phase: "needs-you", reason: "not-converging", round: 1 });
    });
  });

  it("ignores a review it didn't start, and retries its own review ending without a report once before a loop error", () => {
    expect(run([...reviewing, reviewed("manual", [finding("F1", "critical")])]).state.phase).toBe("reviewing");
    const { state, actions } = run([
      ...reviewing,
      { type: "thread-failed", role: "review", reviewId: "rev1", threadId: "thr_r1" },
      { type: "review-started", reviewId: "rev2" },
      { type: "thread-failed", role: "review", reviewId: "rev2", threadId: "thr_r2" },
    ]);
    expect(actions[5]).toEqual([{ type: "spawn-review", commit: sha, mode: "full", depth: "standard", answers: {} }]);
    expect(state).toMatchObject({ phase: "needs-you", reason: "loop-error", failedThreadId: "thr_r2" });
    expect(actions[7]).toEqual([{ type: "move", column: "review" }]);
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

  it("retries a checks thread that ended without a result once, then escalates as a loop error naming the thread", () => {
    const failed = (threadId: string): LoopEvent => ({ type: "thread-failed", role: "checks", commit: sha, threadId });
    const { state, actions } = run([{ type: "monitor", hasThread: true }, ready(), failed("thr_c1"), failed("thr_c2")]);
    expect(actions[2]).toEqual([{ type: "spawn-checks", commit: sha, checkCommand: { command: "pnpm check", source: "project" } }]);
    expect(state).toMatchObject({ phase: "needs-you", reason: "loop-error", failedThreadId: "thr_c2" });
    expect(actions[3]).toEqual([{ type: "move", column: "review" }]);

    // A retry that succeeds leaves the next step its own retry.
    expect(run([{ type: "monitor", hasThread: true }, ready(), failed("thr_c1"), checks(0), classified(3), { type: "thread-failed", role: "review", reviewId: null, threadId: null }]).actions[5]).toEqual([
      { type: "spawn-review", commit: sha, mode: "full", depth: "standard", answers: {} },
    ]);
    // The thread of a commit since superseded failing says nothing about the current one.
    expect(run([{ type: "monitor", hasThread: true }, ready(), ready(fixSha), failed("thr_c1")]).state).toMatchObject({ phase: "checking", retries: 0 });
  });

  describe("questions", () => {
    it("pauses with reason question without moving the card, and resumes on the next ready", () => {
      const { state, actions } = run([{ type: "monitor", hasThread: true }, { type: "question" }]);
      expect(state).toMatchObject({ phase: "paused", reason: "question", pausedPhase: "building" });
      expect(actions[1]).toEqual([]);
      const resumed = run([ready()], state);
      expect(resumed.state).toMatchObject({ phase: "checking", reason: null, pausedPhase: null });
      expect(resumed.actions[0]).toEqual([
        { type: "move", column: "checking" },
        { type: "spawn-checks", commit: sha, checkCommand: { command: "pnpm check", source: "project" } },
      ]);
    });

    it("keeps a fix round paused by a question open for its answers, and records it at the next ready", () => {
      const { state, actions } = run([...reviewing, reviewed("rev1", [finding("F1", "important")]), { type: "question" }, answer({ F1: fixed }), ready(fixSha)]);
      expect(actions[7]).toEqual([]);
      expect(state).toMatchObject({ phase: "checking", rounds: [{ reviewId: "rev1", answers: { F1: fixed } }] });
      expect(actions[8]).toContainEqual({ type: "record-fix", reviewId: "rev1", commit: fixSha, findingIds: ["F1"], disputed: [] });
    });

    it("ignores a question while the board's own threads run", () => {
      expect(run([{ type: "monitor", hasThread: true }, ready(), { type: "question" }]).state.phase).toBe("checking");
      expect(run([{ type: "question" }]).state.phase).toBe("idle");
    });
  });

  it("stops after the current step when unmonitored: a running check's result is kept but drives nothing", () => {
    const { state, actions } = run([{ type: "monitor", hasThread: true }, ready(), { type: "unmonitor" }, checks(1)]);
    expect(state).toMatchObject({ monitored: false, phase: "idle", reason: null, commit: sha, checks: [{ commit: sha, exitCode: 1, passed: false }] });
    expect(actions[2]).toEqual([]);
    expect(actions[3]).toEqual([]);
  });

  it("keeps the findings and history when unmonitored in any phase, ending an open fix round unfixed", () => {
    const building = [{ type: "monitor", hasThread: true }] as LoopEvent[];
    const checking = [...building, ready()];
    const fixing = [...reviewing, reviewed("rev1", [finding("F1", "important")])];
    const phases: Record<string, LoopEvent[]> = {
      building,
      paused: [...building, { type: "question" }],
      checking,
      reviewing,
      fixing,
      "paused fixing": [...fixing, { type: "question" }],
      "needs-you": [...checking, checks(1), ready(fixSha), checks(1, fixSha)],
      "loop error": [...reviewing, { type: "thread-failed", role: "review", reviewId: "rev1", threadId: null }, { type: "thread-failed", role: "review", reviewId: null, threadId: null }],
    };
    for (const [name, events] of Object.entries(phases)) {
      const before = run(events).state;
      const { state, actions } = run([{ type: "unmonitor" }], before);
      expect(state, name).toMatchObject({ monitored: false, reason: null, pausedPhase: null, failedThreadId: null, rounds: before.rounds, checks: before.checks });
      expect(state.phase, name).toBe(name === "checking" || name === "reviewing" ? name : "idle");
      expect(actions[0], name).toEqual(name.endsWith("fixing") ? [{ type: "end-fix", reviewId: "rev1", findingIds: ["F1"] }] : []);
    }
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
