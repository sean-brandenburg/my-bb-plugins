import { describe, expect, it } from "vitest";
import { findingTallies, type Finding, type Review, type ReviewReport } from "../../shared/review";
import { applyFindingEdits, earlierFindings, effectiveSelection, pendingFindings, selectedFindingsBody, standingReviews, summarize } from "./findings";

function finding(id: string, severity: Finding["severity"], overrides: Partial<Finding> = {}): Finding {
  return {
    id,
    severity,
    title: `Title ${id}`,
    description: `Description ${id}`,
    fix: null,
    locations: [],
    flaggedBy: ["correctness"],
    category: null,
    importance: null,
    scopeFit: null,
    carriedFrom: null,
    confidence: null,
    preExisting: false,
    verification: null,
    ...overrides,
  };
}

function report(findings: Finding[]): ReviewReport {
  return { version: 1, summary: "Adds caching.", commit: null, range: null, reviewers: [], skippedReviewers: [], skippedFiles: [], findings, filtered: [], carriesForward: false, resolved: [] };
}

function review(body: string | null, reviewReport: ReviewReport | null, selection: Record<string, boolean>, overrides: Partial<Review> = {}): Review {
  return {
    id: "r1",
    ticketId: "t1",
    threadId: "thr_1",
    status: "completed",
    commitSha: null,
    baseRef: null,
    headRef: null,
    sinceCommitSha: null,
    body,
    report: reviewReport,
    selection,
    selectionOverrides: {},
    findingEdits: {},
    appliedFindingIds: [],
    createdAt: 0,
    completedAt: 0,
    apply: null,
    ...overrides,
  };
}

describe("selectedFindingsBody", () => {
  it("passes a free-form review through whole, with a placeholder when it is empty", () => {
    expect(selectedFindingsBody(review("Looks fine.", null, {}))).toEqual({ body: "Looks fine.", findingIds: null });
    expect(selectedFindingsBody(review(null, null, {})).body).toBe("(the review body is empty; open the review thread for details)");
  });

  it("keeps only the selected findings, grouped by severity, with locations, scores and fixes", () => {
    const findings = [
      finding("M1", "minor", { locations: [{ file: "a.ts", startLine: 3, endLine: 3 }] }),
      finding("C1", "critical", {
        importance: 5,
        scopeFit: 4,
        confidence: 100,
        fix: "Guard the null",
        locations: [
          { file: "b.ts", startLine: null, endLine: null },
          { file: "c.ts", startLine: 10, endLine: 12 },
          { file: "d.ts", startLine: 7, endLine: null },
        ],
      }),
      finding("I1", "important"),
    ];
    const { body, findingIds } = selectedFindingsBody(review("raw", report(findings), { M1: true, C1: true, I1: false }));
    expect(findingIds).toEqual(["M1", "C1"]);
    expect(body).toContain("2 of 3 findings were selected on the Kanban board");
    expect(body).not.toContain("### Important");
    expect(body.indexOf("### Critical (Must Fix)")).toBeLessThan(body.indexOf("### Minor (Nice to Fix)"));
    expect(body).toContain("- **C1** (importance 5, scope 4, confidence 100) `b.ts`, `c.ts:10-12`, `d.ts:7` — Title C1. Description C1 — Guard the null (flagged by: correctness)");
    expect(body).toContain("- **M1** `a.ts:3` — Title M1. Description M1 (flagged by: correctness)");
    const block = /```json review-findings\n([\s\S]*)\n```$/u.exec(body);
    expect((JSON.parse(block![1]!) as ReviewReport).findings.map((entry) => entry.id)).toEqual(["M1", "C1"]);
  });

  it("never hands the apply round a filtered finding", () => {
    const { body } = selectedFindingsBody(review("raw", { ...report([finding("F1", "minor")]), filtered: [finding("X1", "critical", { confidence: 20 })] }, { F1: true }));
    const block = /```json review-findings\n([\s\S]*)\n```$/u.exec(body);
    expect((JSON.parse(block![1]!) as ReviewReport).filtered).toEqual([]);
    expect(body).not.toContain("X1");
  });
});

describe("applied findings", () => {
  it("leaves fixed findings out of the next round, the open counts and the scores", () => {
    const entry = review(null, report([finding("F1", "critical", { importance: 5, scopeFit: 5 }), finding("F2", "important", { importance: 3, scopeFit: 3 })]), { F1: true, F2: true }, { appliedFindingIds: ["F1"] });
    expect(pendingFindings(entry).map((item) => item.id)).toEqual(["F2"]);
    expect(selectedFindingsBody(entry).findingIds).toEqual(["F2"]);
    expect(summarize(entry)).toMatchObject({ counts: { critical: 0, important: 1, minor: 0 }, appliedCount: 1, selectedCount: 1, scores: { maxImportance: 3 } });
    expect(summarize(entry)).not.toHaveProperty("appliedFindingIds");
  });
});

describe("pre-existing findings", () => {
  const withOld = report([finding("F1", "important", { importance: 3, scopeFit: 3 }), finding("F2", "critical", { importance: 5, scopeFit: 1, preExisting: true })]);

  it("are left out of the selection, the counts and the scores, which say what the change itself has wrong", () => {
    const entry = review(null, withOld, effectiveSelection(withOld, {}));
    expect(entry.selection).toEqual({ F1: true, F2: false });
    expect(summarize(entry)).toMatchObject({ counts: { critical: 0, important: 1, minor: 0 }, appliedCount: 0, selectedCount: 1, scores: { maxImportance: 3, scored: 1 } });
  });

  it("never reach an apply round, even when picked by hand", () => {
    expect(effectiveSelection(withOld, { F2: true })).toEqual({ F1: true, F2: false });
    const forced = review(null, withOld, { F1: false, F2: true });
    expect(pendingFindings(forced)).toEqual([]);
    expect(selectedFindingsBody(forced).findingIds).toEqual([]);
    expect(summarize(forced).selectedCount).toBe(0);
  });
});

describe("findingTallies", () => {
  it("counts the change's own findings apart from pre-existing ones, agreeing with the summary's selected count", () => {
    const reviewReport = report([finding("F1", "critical"), finding("F2", "minor"), finding("F3", "important"), finding("F4", "important", { preExisting: true })]);
    const selection = { F1: true, F2: false, F3: true, F4: true };
    const tallies = findingTallies(reviewReport, selection, ["F1"]);
    expect(tallies.introduced.map((entry) => entry.id)).toEqual(["F1", "F2", "F3"]);
    expect(tallies.preExisting.map((entry) => entry.id)).toEqual(["F4"]);
    expect(tallies).toMatchObject({ open: 2, selected: 1, applied: 1 });
    expect(summarize(review(null, reviewReport, selection, { appliedFindingIds: ["F1"] })).selectedCount).toBe(tallies.selected);
  });
});

describe("effectiveSelection", () => {
  it("lets the user's overrides win over the suggested selection", () => {
    const reviewReport = report([finding("C1", "critical"), finding("M1", "minor"), finding("I1", "important")]);
    expect(effectiveSelection(reviewReport, { C1: false, M1: true })).toEqual({ C1: false, M1: true, I1: true });
    expect(effectiveSelection(null, { C1: true })).toEqual({});
  });
});

describe("applyFindingEdits", () => {
  it("rewords edited findings, clears a fix only when the edit says null, and leaves the rest alone", () => {
    const reviewReport = report([finding("C1", "critical", { fix: "Old fix" }), finding("M1", "minor", { fix: "Keep me" })]);
    const edited = applyFindingEdits(reviewReport, { C1: { title: "New title", fix: null }, M1: { description: "Shorter" } })!;
    expect(edited.findings[0]).toMatchObject({ title: "New title", description: "Description C1", fix: null });
    expect(edited.findings[1]).toMatchObject({ title: "Title M1", description: "Shorter", fix: "Keep me" });
    expect(applyFindingEdits(reviewReport, {})).toBe(reviewReport);
  });
});

describe("standingReviews", () => {
  const at = (id: string, createdAt: number, overrides: Partial<Review> = {}) => review(null, report([]), {}, { id, createdAt, ...overrides });

  it("stacks re-reviews back to the latest full review, oldest first, ignoring unfinished ones", () => {
    const reviews = [at("full-old", 1), at("full", 2), at("inc-1", 3, { sinceCommitSha: "a" }), at("inc-2", 4, { sinceCommitSha: "b" }), at("running", 5, { status: "running", sinceCommitSha: "c" })];
    expect(standingReviews(reviews).map((entry) => entry.id)).toEqual(["full", "inc-1", "inc-2"]);
  });

  it("stops at a re-review that already carried every open finding forward", () => {
    const reviews = [at("full", 1), at("carried", 2, { sinceCommitSha: "a", report: { ...report([]), carriesForward: true } }), at("inc", 3, { sinceCommitSha: "b" })];
    expect(standingReviews(reviews).map((entry) => entry.id)).toEqual(["carried", "inc"]);
  });
});

describe("earlierFindings", () => {
  it("keys findings by review and says what the apply round did with each", () => {
    const applied = review(null, report([finding("F1", "critical"), finding("F2", "minor")]), {}, {
      id: "r1",
      // The latest round only had F3; F1 was fixed by an earlier one.
      apply: { threadId: "thr_a", startedAt: 1, completedAt: 2, pushedCommit: "abcdef0123456789", findingIds: ["F3"], push: true },
      appliedFindingIds: ["F1", "F3"],
    });
    const unapplied = review(null, report([finding("F1", "important", { carriedFrom: "r0/F4" })]), {}, { id: "r2" });
    expect(earlierFindings([applied, unapplied]).map(({ handle, applyRound, title }) => ({ handle, applyRound, title }))).toEqual([
      { handle: "r1/F1", applyRound: "an apply round committed a fix for it (the latest round's commit is abcdef0); verify it worked", title: "Title F1" },
      { handle: "r1/F2", applyRound: "deliberately left out of the apply rounds", title: "Title F2" },
      { handle: "r2/F1", applyRound: null, title: "Title F1" },
    ]);
    expect(earlierFindings([unapplied])[0]).not.toHaveProperty("carriedFrom");
    const verified = review(null, report([finding("F1", "minor", { confidence: 90, preExisting: true, verification: "Read it" })]), {}, { id: "r3" });
    expect(earlierFindings([verified])[0]).toMatchObject({ handle: "r3/F1", confidence: 90, preExisting: true, verification: "Read it" });
  });
});
