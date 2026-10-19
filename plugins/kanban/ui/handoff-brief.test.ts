import { describe, expect, it } from "vitest";
import { loopStateSchema, type LoopState } from "../shared/loop";
import { findingSchema, reviewReportSchema, type Finding } from "../shared/review";
import { handoffBrief, type BriefReview, type BriefSection } from "./handoff-brief";

const loop = (overrides: Partial<LoopState>): LoopState => loopStateSchema.parse({ monitored: true, phase: "needs-you", reason: "clean", ...overrides });
const finding = (id: string, overrides: Partial<Finding> = {}): Finding => findingSchema.parse({ id, severity: "minor", title: `title ${id}`, ...overrides });
const review = (id: string, createdAt: number, report: Partial<Parameters<typeof reviewReportSchema.parse>[0]>): BriefReview => ({
  id,
  status: "completed",
  createdAt,
  report: reviewReportSchema.parse({ version: 5, findings: [], ...report }),
});
const section = <K extends BriefSection["kind"]>(sections: BriefSection[] | null, kind: K) => sections?.find((entry) => entry.kind === kind) as Extract<BriefSection, { kind: K }> | undefined;

describe("handoffBrief", () => {
  it("shows nothing for a card the loop isn't waiting on you for", () => {
    expect(handoffBrief(loop({ phase: "reviewing", reason: null }), [])).toBeNull();
    expect(handoffBrief(loop({ monitored: false }), [])).toBeNull();
  });

  it("leads a clean brief with the level and an empty not-covered list, omitting the empty sections", () => {
    const sections = handoffBrief(loop({ reviewId: "r1", attention: { level: "glance", reasons: ["small change"] } }), [review("r1", 1, {})]);
    expect(sections?.map((entry) => entry.kind)).toEqual(["level", "not-covered"]);
    expect(sections?.[0]).toMatchObject({ level: "glance", reasons: ["small change"], escalation: null });
    expect(section(sections, "not-covered")).toEqual({ kind: "not-covered", items: [], known: true });
  });

  it("leads with the escalation when the loop stopped without a review, and says no one listed the gaps", () => {
    const sections = handoffBrief(loop({ reason: "loop-error", failedThreadId: "t9" }), []);
    expect(sections?.[0]).toMatchObject({ kind: "level", level: null, failedThreadId: "t9", escalation: "A checks or review thread failed twice" });
    expect(section(sections, "not-covered")?.known).toBe(false);
    expect(handoffBrief(loop({ phase: "paused", reason: "question" }), [])?.[0]).toMatchObject({ escalation: expect.stringContaining("waiting on your answer") });
  });

  it("leads with the escalation for every reason that isn't clean", () => {
    for (const reason of ["cap", "not-converging", "checks", "dispute", "loop-error"] as const) {
      const sections = handoffBrief(loop({ reason }), []);
      expect(sections?.[0]?.kind).toBe("level");
      expect(sections?.[0]).toMatchObject({ escalation: expect.any(String) });
    }
  });

  it("names only the findings marked fixed that are still open as not converging, not the disputed ones", () => {
    const sections = handoffBrief(loop({ reason: "not-converging", reviewId: "r2" }), [
      review("r2", 2, {
        findings: [
          finding("F1", { carriedFrom: "r1/F1" }),
          finding("F2", { carriedFrom: "r1/F2", dispute: { reason: "by design", outcome: "rejected", note: "" } }),
        ],
      }),
    ]);
    expect(section(sections, "level")?.escalation).toContain("F1 title F1");
    expect(section(sections, "level")?.escalation).not.toContain("F2");
  });

  it("keeps the checks the board re-ran apart from what the agent claims", () => {
    const sections = handoffBrief(
      loop({
        checkCommand: { command: "pnpm test", source: "agent" },
        checks: [{ commit: "abc1234", exitCode: 0, passed: true }],
        evidence: { commands: [{ command: "pnpm lint", exitCode: 0, outputTail: "" }], screenshots: ["shot.png"] },
      }),
      [],
    );
    expect(section(sections, "evidence")).toEqual({
      kind: "evidence",
      reran: [{ commit: "abc1234", exitCode: 0, passed: true, command: "pnpm test" }],
      reranBy: "agent",
      claimed: [{ command: "pnpm lint", exitCode: 0, outputTail: "" }],
      screenshots: ["shot.png"],
    });
  });

  it("puts every section in order, with the history, what was left out, and the disputes awaiting you", () => {
    const r1 = review("r1", 1, {
      findings: [finding("F1", { severity: "important" }), finding("F2", { category: "style" }), finding("F3", { severity: "important" })],
      notCovered: ["UI change, no headless test"],
    });
    const r2 = review("r2", 2, {
      carriesForward: true,
      notCovered: ["UI change, no headless test"],
      resolved: [
        { id: "r1/F1", title: "title F1" },
        { id: "r1/F2", title: "title F2" },
        { id: "r1/F3", title: "title F3", dispute: { reason: "not reachable", outcome: "accepted", note: "agreed" } },
      ],
      findings: [
        finding("F4", { severity: "important", dispute: { reason: "by design", outcome: "rejected", note: "breaks the contract" } }),
        finding("F5", { triage: { decision: "defer", reason: "separate work" } }),
        finding("F6", { triage: { decision: "drop", reason: "churn" } }),
        finding("F7", { preExisting: true }),
      ],
    });
    const sections = handoffBrief(
      loop({
        reason: "dispute",
        reviewId: "r2",
        round: 1,
        attention: { level: "read", reasons: ["1 disputed finding"] },
        checks: [{ commit: "abc1234", exitCode: 0, passed: true }],
        rounds: [{ reviewId: "r1", handed: ["F1", "F2", "F3"], answers: { F1: { answer: "fixed" }, F2: { answer: "fixed" }, F3: { answer: "disputed", reason: "not reachable" } } }],
      }),
      [r2, r1, review("manual", 0, { resolved: [{ id: "old/F1", title: "before monitoring" }] })],
    );
    expect(sections?.map((entry) => entry.kind)).toEqual(["level", "not-covered", "evidence", "history", "left-out", "disputes"]);
    expect(sections?.[0]).toMatchObject({ escalation: expect.stringContaining("rejected"), reasons: ["1 disputed finding"] });
    expect(section(sections, "not-covered")?.items).toEqual(["UI change, no headless test"]);
    expect(section(sections, "history")).toMatchObject({
      rounds: [{ round: 1, handed: 3, resolved: [{ id: "r1/F1" }, { id: "r1/F2" }, { id: "r1/F3" }], claimed: { fixed: 2, disputed: 1 } }],
      acceptedDisputes: [{ id: "r1/F3", dispute: { reason: "not reachable", note: "agreed" } }],
      polish: [{ id: "r1/F2", title: "title F2" }],
    });
    expect(section(sections, "left-out")).toMatchObject({ deferred: [{ id: "F5", note: "separate work" }], dropped: [{ id: "F6", note: "churn" }], preExisting: [{ id: "F7" }], leftOpen: [] });
    expect(section(sections, "disputes")?.disputes).toEqual([{ id: "F4", severity: "important", title: "title F4", agent: "by design", verifier: "breaks the contract" }]);
  });
});
