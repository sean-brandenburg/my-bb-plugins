import { describe, expect, it } from "vitest";
import { buildDiffThreads, localCommentState, threadIsOpen } from "./lib/app/comments/threads";
import { buildFileTree } from "./lib/app/file-tree/build-file-tree";
import { activeReviews, inlineFindingsByPath } from "./lib/app/findings/findings";
import { isGeneratedFile } from "./lib/app/generated";
import { riskByPath } from "./lib/app/risk";
import { enclosingDefinition } from "./lib/app/structural/enclosing-definition";
import { detectMoves } from "./lib/app/structural/moves";
import { hunkSpan, structuralRows, visibleRows } from "./lib/app/structural/rows";
import { splitUnifiedDiff } from "./lib/server";
import type { DiffComment, DiffFile, Finding, GithubComment, Review, StructuralDiff } from "./lib/types";

function local(overrides: Partial<DiffComment> & { id: string }): DiffComment {
  return {
    path: "x.ts",
    line: 1,
    side: "RIGHT",
    body: "body",
    target: "local",
    inReplyTo: null,
    author: null,
    authorThreadId: null,
    createdAt: 0,
    updatedAt: 0,
    postedAt: null,
    postedUrl: null,
    githubCommentId: null,
    addressedAt: null,
    applyId: null,
    ...overrides,
  };
}

function github(overrides: Partial<GithubComment> & { id: string }): GithubComment {
  return {
    kind: "review-comment",
    author: "octocat",
    mine: false,
    body: "body",
    path: "x.ts",
    line: 1,
    inReplyTo: null,
    side: "RIGHT",
    outdated: false,
    resolved: null,
    url: "https://github.invalid/c",
    createdAt: "1970-01-01T00:00:00Z",
    addressedAt: null,
    ...overrides,
  };
}

describe("localCommentState", () => {
  it("reads agent replies, drafts, posted, addressed, sent and pending comments", () => {
    expect(localCommentState(local({ id: "a", author: "agent" }))).toBe("agent");
    expect(localCommentState(local({ id: "a", target: "github" }))).toBe("draft");
    expect(localCommentState(local({ id: "a", target: "github", postedAt: 1 }))).toBe("posted");
    expect(localCommentState(local({ id: "a", addressedAt: 1, applyId: "s" }))).toBe("addressed");
    expect(localCommentState(local({ id: "a", applyId: "s" }))).toBe("submitted");
    expect(localCommentState(local({ id: "a" }))).toBe("pending");
  });
});

describe("buildDiffThreads", () => {
  it("puts the root first and replies after it oldest first", () => {
    const threads = buildDiffThreads(
      [local({ id: "late", inReplyTo: "root", createdAt: 30 }), local({ id: "root", createdAt: 10 }), local({ id: "early", inReplyTo: "root", createdAt: 20 })],
      [],
    );
    expect(threads).toHaveLength(1);
    expect(threads[0]!.entries.map((entry) => entry.comment.id)).toEqual(["root", "early", "late"]);
  });

  it("interleaves local replies to a GitHub thread by time", () => {
    const threads = buildDiffThreads(
      [local({ id: "mine", inReplyTo: "review-comment:1", createdAt: Date.parse("1970-01-01T00:00:02Z") })],
      [github({ id: "review-comment:1" }), github({ id: "review-comment:2", inReplyTo: "review-comment:1", createdAt: "1970-01-01T00:00:03Z" })],
    );
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ id: "review-comment:1", onGithub: true, orphaned: false });
    expect(threads[0]!.entries.map((entry) => `${entry.source}:${entry.comment.id}`)).toEqual(["github:review-comment:1", "local:mine", "github:review-comment:2"]);
  });

  it("shows a posted draft once, as its synced copy", () => {
    const threads = buildDiffThreads([local({ id: "draft", target: "github", postedAt: 1, githubCommentId: "review-comment:7" })], [github({ id: "review-comment:7" })]);
    expect(threads.map((thread) => thread.id)).toEqual(["review-comment:7"]);
  });

  it("keeps a posted draft with no synced copy yet, and attaches GitHub replies to it by its GitHub id", () => {
    const threads = buildDiffThreads(
      [local({ id: "draft", target: "github", postedAt: 1, githubCommentId: "review-comment:7" })],
      [github({ id: "review-comment:8", inReplyTo: "review-comment:7" })],
    );
    expect(threads).toHaveLength(1);
    expect(threads[0]!.id).toBe("draft");
    expect(threads[0]!.entries.map((entry) => entry.comment.id)).toEqual(["draft", "review-comment:8"]);
  });

  it("groups replies whose root is gone into an orphaned thread that cannot be answered", () => {
    const [thread] = buildDiffThreads([local({ id: "reply", inReplyTo: "gone", target: "github" })], []);
    expect(thread).toMatchObject({ id: "gone", orphaned: true, onGithub: false });
  });

  it("drops the line of an outdated GitHub comment", () => {
    const [thread] = buildDiffThreads([], [github({ id: "review-comment:1", outdated: true, line: 12 })]);
    expect(thread).toMatchObject({ line: null, outdated: true });
  });

  it("lets replies go to GitHub only from line comments that are, or will become, inline GitHub comments", () => {
    const onGithub = (comment: DiffComment) => buildDiffThreads([comment], [])[0]!.onGithub;
    expect(onGithub(local({ id: "a", target: "github" }))).toBe(true);
    expect(onGithub(local({ id: "a", target: "github", line: null }))).toBe(false);
    expect(onGithub(local({ id: "a", target: "github", postedAt: 1, githubCommentId: "review-comment:1" }))).toBe(true);
    expect(onGithub(local({ id: "a", target: "github", postedAt: 1, githubCommentId: "review:1" }))).toBe(false);
    expect(onGithub(local({ id: "a" }))).toBe(false);
  });

  it("ignores synced comments that are not inline review comments", () => {
    expect(buildDiffThreads([], [github({ id: "issue-comment:1", kind: "issue-comment" }), github({ id: "review-comment:2", path: null })])).toEqual([]);
  });
});

describe("threadIsOpen", () => {
  const thread = (locals: DiffComment[], githubs: GithubComment[] = []) => buildDiffThreads(locals, githubs)[0]!;
  it("closes resolved and addressed threads unless a reply is still unsent", () => {
    expect(threadIsOpen(thread([], [github({ id: "review-comment:1", resolved: true })]))).toBe(false);
    expect(threadIsOpen(thread([local({ id: "root", applyId: "s", addressedAt: 1 })]))).toBe(false);
    expect(threadIsOpen(thread([local({ id: "root", applyId: "s", addressedAt: 1 }), local({ id: "reply", inReplyTo: "root" })]))).toBe(true);
    expect(threadIsOpen(thread([local({ id: "root", applyId: "s" })]))).toBe(true);
    expect(threadIsOpen(thread([], [github({ id: "review-comment:1" })]))).toBe(true);
  });
});

function finding(id: string, locations: Finding["locations"], severity: Finding["severity"] = "minor"): Finding {
  return { id, severity, title: id, description: "", fix: null, locations, importance: null, scopeFit: null };
}

function review(id: string, createdAt: number, findings: Finding[], overrides: Partial<Review> = {}): Review {
  return { id, status: "completed", sinceCommitSha: null, report: { findings }, selection: {}, selectionOverrides: {}, findingEdits: {}, createdAt, ...overrides };
}

describe("activeReviews", () => {
  it("keeps the latest full review and the incremental ones after it", () => {
    const reviews = [
      review("full-old", 1, []),
      review("inc-old", 2, [], { sinceCommitSha: "a" }),
      review("full", 3, []),
      review("inc", 4, [], { sinceCommitSha: "b" }),
      review("running", 5, [], { status: "running", report: null }),
    ];
    expect(activeReviews(reviews).map((entry) => entry.id)).toEqual(["full", "inc"]);
  });

  it("keeps every completed review when none is full", () => {
    expect(activeReviews([review("b", 2, [], { sinceCommitSha: "x" }), review("a", 1, [], { sinceCommitSha: "y" })]).map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});

describe("inlineFindingsByPath", () => {
  it("places a finding at each location and marks new and touched ones", () => {
    const reviews = [
      review("full", 1, [finding("F1", [{ file: "a.ts", startLine: 5, endLine: 8 }, { file: "b.ts", startLine: null, endLine: null }])], { selection: { F1: true }, selectionOverrides: { F1: true } }),
      review("inc", 2, [finding("F2", [{ file: "a.ts", startLine: 20, endLine: null }])], { sinceCommitSha: "abc", findingEdits: { F2: {} } }),
    ];
    const byPath = inlineFindingsByPath(reviews, { fromSha: "a", toSha: "b", files: [{ path: "a.ts", status: "modified", additions: 1, deletions: 0, ranges: [[7, 7]] }] });
    expect(byPath.get("a.ts")!.map((entry) => ({ id: entry.item.finding.id, line: entry.line, isNew: entry.item.isNew, touched: entry.item.touched }))).toEqual([
      { id: "F1", line: 5, isNew: false, touched: true },
      { id: "F2", line: 20, isNew: true, touched: false },
    ]);
    expect(byPath.get("b.ts")!.map((entry) => entry.line)).toEqual([null]);
    const f1 = byPath.get("a.ts")![0]!.item;
    expect(f1).toMatchObject({ selected: true, overridden: true, edited: false });
    expect(byPath.get("a.ts")![1]!.item).toMatchObject({ selected: false, overridden: false, edited: true });
  });
});

describe("riskByPath", () => {
  it("prefers the current tour's score and falls back to the worst finding", () => {
    const findings = inlineFindingsByPath([review("r", 1, [finding("A", [{ file: "a.ts", startLine: 1, endLine: 1 }], "critical"), finding("B", [{ file: "b.ts", startLine: 1, endLine: 1 }], "important"), finding("C", [{ file: "b.ts", startLine: 2, endLine: 2 }])])], null);
    const tour = {
      stale: false,
      narrative: { threadId: "t", status: "completed" as const, report: { summary: "", watchOut: [], readingOrder: [{ path: "a.ts", role: "key" as const, note: "", lines: [], risk: 2, changes: [] }] } },
    };
    expect(Object.fromEntries(riskByPath(tour, findings))).toEqual({ "a.ts": 2, "b.ts": 4 });
    expect(Object.fromEntries(riskByPath({ ...tour, stale: true }, findings))).toEqual({ "a.ts": 5, "b.ts": 4 });
  });
});

function structural(aligned: StructuralDiff["aligned"], changedNew: number[] = [], changedOld: number[] = []): StructuralDiff {
  return {
    available: true,
    reason: null,
    language: null,
    status: "changed",
    oldText: "",
    newText: "",
    aligned,
    oldChanges: changedOld.map((line) => ({ line, changes: [] })),
    newChanges: changedNew.map((line) => ({ line, changes: [] })),
  };
}

describe("structural rows", () => {
  const unchanged = (count: number): StructuralDiff["aligned"] => Array.from({ length: count }, (_, i) => [i + 1, i + 1]);

  it("marks one-sided rows and rows with changed spans as changed", () => {
    const rows = structuralRows(structural([[1, 1], [2, null], [null, 2], [3, 3]], [3]));
    expect(rows.map((row) => row.changed)).toEqual([false, true, true, true]);
  });

  it("shows three lines of context around changes and folds the rest", () => {
    const rows = structuralRows(structural(unchanged(20), [10]));
    const visible = visibleRows(rows, { revealed: new Set(), findingLines: [], threads: [] });
    expect([...visible].sort((a, b) => a - b)).toEqual([6, 7, 8, 9, 10, 11, 12]);
  });

  it("unfolds around findings, threads on either side, and revealed rows", () => {
    const aligned: StructuralDiff["aligned"] = [...unchanged(30).slice(0, 15), [16, null], ...unchanged(30).slice(16).map(([lhs, rhs]) => [lhs, rhs! - 1] as [number, number])];
    const rows = structuralRows(structural(aligned, [], []));
    const visible = visibleRows(rows, { revealed: new Set([29]), findingLines: [2, null], threads: [{ line: 25, side: "LEFT" }] });
    // Row 15 is the deletion; old line 25 is row 24; new line 2 is row 1.
    expect([...visible].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 29]);
  });

  it("spans a hunk on its new side unless it only deletes", () => {
    const rows = structuralRows(structural([[1, 1], [2, null], [3, null], [4, 2]], [], []));
    expect(hunkSpan(rows, new Set([1, 2]), 1)).toEqual({ end: 2, side: "old", start: 2, stop: 3 });
    expect(hunkSpan(rows, new Set([0, 1, 2, 3]), 0)).toEqual({ end: 3, side: "new", start: 1, stop: 2 });
  });
});

describe("detectMoves", () => {
  const rowsOf = (aligned: Array<[number | null, number | null]>) => aligned.map(([lhs, rhs], index) => ({ index, lhs, rhs }));

  it("pairs a deleted block with an identical added block", () => {
    const oldLines = ["a()", "b()", "c()", "keep"];
    const newLines = ["keep", "a()", "b()", "c()"];
    const rows = rowsOf([[1, null], [2, null], [3, null], [4, 1], [null, 2], [null, 3], [null, 4]]);
    const moved = detectMoves(rows, oldLines, newLines);
    expect(moved.get(0)).toEqual({ counterpart: 4, counterpartLine: 2, first: true });
    expect(moved.get(6)).toEqual({ counterpart: 2, counterpartLine: 3, first: false });
    expect(moved.has(3)).toBe(false);
  });

  it("ignores runs shorter than three lines or with fewer than two non-blank lines", () => {
    const short = detectMoves(rowsOf([[1, null], [2, null], [null, 1], [null, 2]]), ["a()", "b()"], ["a()", "b()"]);
    expect(short.size).toBe(0);
    const blank = detectMoves(rowsOf([[1, null], [2, null], [3, null], [null, 1], [null, 2], [null, 3]]), ["x()", "", ""], ["x()", "", ""]);
    expect(blank.size).toBe(0);
  });
});

describe("enclosingDefinition", () => {
  it("finds the function around an indented line", () => {
    const lines = ["export function foo() {", "  const a = 1;", "", "  return a;", "}"];
    expect(enclosingDefinition(lines, 4)).toBe("export function foo() {");
  });

  it("finds a method inside a class", () => {
    const lines = ["class A {", "  method(x) {", "    return x;", "  }", "}"];
    expect(enclosingDefinition(lines, 3)).toBe("method(x) {");
  });

  it("gives nothing for a top-level line under a non-definition", () => {
    expect(enclosingDefinition(["const a = 1;", "const b = 2;"], 2)).toBeNull();
  });
});

function file(path: string, additions = 1, deletions = 0, vendored = false): DiffFile {
  return { path, previousPath: null, status: "modified", additions, deletions, patch: null, vendored };
}

describe("buildFileTree", () => {
  it("nests by directory, folds single-child chains, sorts, and sums stats", () => {
    const tree = buildFileTree([file("a/b/c/y.ts", 2, 1), file("root.ts"), file("a/b/c/x.ts", 3, 0), file("a/z.ts")]);
    expect(tree.files.map((entry) => entry.path)).toEqual(["root.ts"]);
    expect(tree.dirs.map((dir) => dir.name)).toEqual(["a"]);
    const a = tree.dirs[0]!;
    expect(a.files.map((entry) => entry.path)).toEqual(["a/z.ts"]);
    expect(a.dirs.map((dir) => ({ name: dir.name, path: dir.path, files: dir.files.map((entry) => entry.path) }))).toEqual([{ name: "b/c", path: "a/b/c", files: ["a/b/c/x.ts", "a/b/c/y.ts"] }]);
    expect({ additions: a.additions, deletions: a.deletions }).toEqual({ additions: 6, deletions: 1 });
    expect({ additions: tree.additions, deletions: tree.deletions }).toEqual({ additions: 7, deletions: 1 });
  });
});

describe("isGeneratedFile", () => {
  it("recognises lockfiles, build output, generated code and vendored trees", () => {
    for (const path of ["pnpm-lock.yaml", "web/package-lock.json", "go.sum", "dist/app.js", "api/user.pb.go", "src/schema.generated.ts", "pkg/zz_generated.deepcopy.go", "x/mock_store.go"]) {
      expect(isGeneratedFile(file(path)), path).toBe(true);
    }
    expect(isGeneratedFile(file("src/app.ts", 1, 0, true))).toBe(true);
    for (const path of ["src/app.ts", "README.md", "src/build.ts"]) expect(isGeneratedFile(file(path)), path).toBe(false);
  });
});

describe("splitUnifiedDiff", () => {
  it("reads paths, status, counts and binary files from a multi-file diff", () => {
    const diff = [
      "diff --git a/old.ts b/new.ts",
      "similarity index 90%",
      "rename from old.ts",
      "rename to new.ts",
      "--- a/old.ts",
      "+++ b/new.ts",
      "@@ -1,2 +1,2 @@",
      " keep",
      "-gone",
      "+came",
      "diff --git a/added.ts b/added.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/added.ts",
      "@@ -0,0 +1 @@",
      "+hello",
      "diff --git a/removed.ts b/removed.ts",
      "deleted file mode 100644",
      "--- a/removed.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-bye",
      "diff --git a/vendor/lib/logo.png b/vendor/lib/logo.png",
      "Binary files a/vendor/lib/logo.png and b/vendor/lib/logo.png differ",
      "",
    ].join("\n");
    const files = splitUnifiedDiff(diff);
    expect(files.map(({ path, previousPath, status, additions, deletions, vendored }) => ({ path, previousPath, status, additions, deletions, vendored }))).toEqual([
      { path: "new.ts", previousPath: "old.ts", status: "renamed", additions: 1, deletions: 1, vendored: false },
      { path: "added.ts", previousPath: null, status: "added", additions: 1, deletions: 0, vendored: false },
      { path: "removed.ts", previousPath: null, status: "removed", additions: 0, deletions: 1, vendored: false },
      { path: "vendor/lib/logo.png", previousPath: null, status: "modified", additions: 0, deletions: 0, vendored: true },
    ]);
    expect(files[0]!.patch).toContain("@@ -1,2 +1,2 @@");
    expect(files[3]!.patch).toBeNull();
  });
});
