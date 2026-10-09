import { describe, expect, it } from "vitest";
import type { Finding, Review, ReviewReport } from "../../shared/review";
import { applyFindingEdits, effectiveSelection, selectedFindingsBody } from "./findings";

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
    ...overrides,
  };
}

function report(findings: Finding[]): ReviewReport {
  return { version: 1, summary: "Adds caching.", commit: null, range: null, reviewers: [], skippedReviewers: [], skippedFiles: [], findings };
}

function review(body: string | null, reviewReport: ReviewReport | null, selection: Record<string, boolean>): Review {
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
    createdAt: 0,
    completedAt: 0,
    apply: null,
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
    expect(body).toContain("- **C1** (importance 5, scope 4) `b.ts`, `c.ts:10-12`, `d.ts:7` — Title C1. Description C1 — Guard the null (flagged by: correctness)");
    expect(body).toContain("- **M1** `a.ts:3` — Title M1. Description M1 (flagged by: correctness)");
    const block = /```json review-findings\n([\s\S]*)\n```$/u.exec(body);
    expect((JSON.parse(block![1]!) as ReviewReport).findings.map((entry) => entry.id)).toEqual(["M1", "C1"]);
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
