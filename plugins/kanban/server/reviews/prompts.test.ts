import { describe, expect, it } from "vitest";
import type { Ticket } from "../../shared/board";
import type { Review } from "../../shared/review";
import { localApplyPrompt, prApplyPrompt, reviewPrompt } from "./prompts";
import { localSubject, prSubject, subjectLabel } from "./subject";

const commit = "0123456789abcdef0123456789abcdef01234567";
const since = "fedcba9876543210fedcba9876543210fedcba98";

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "t1",
    title: "Cache lookups",
    description: "",
    columnId: "in-progress",
    kind: "adhoc",
    tags: [],
    sourceId: null,
    threadId: "thr_card",
    reviewThreadId: null,
    latestReview: null,
    comments: null,
    parentId: null,
    dueDate: null,
    children: { total: 0, done: 0, withThread: 0 },
    pendingDiffComments: 0,
    canPostToGithub: false,
    defaultCommentTarget: "local",
    projectId: "proj_1",
    pr: null,
    jira: null,
    position: 0,
    columnEnteredAt: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function prTicket(): Ticket {
  return ticket({
    kind: "pr",
    pr: {
      repo: "acme-co/widgets",
      number: 7,
      url: "https://github.com/acme-co/widgets/pull/7",
      role: "authored",
      state: "open",
      author: "me",
      updatedAt: "",
      headRef: null,
      checks: null,
    },
  });
}

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: "r1",
    ticketId: "t1",
    threadId: "thr_review",
    subjectKind: "local",
    status: "completed",
    commitSha: since,
    baseRef: "main",
    headRef: null,
    sinceCommitSha: null,
    body: "## Review Findings\n- a.ts:1 fix me",
    report: null,
    selection: {},
    selectionOverrides: {},
    findingEdits: {},
    appliedFindingIds: [],
    createdAt: 0,
    completedAt: 0,
    apply: null,
    ...overrides,
  };
}

describe("review subjects", () => {
  it("takes a PR card's pull request and refuses a card without one", () => {
    expect(prSubject(prTicket())).toEqual({ kind: "pr", repo: "acme-co/widgets", number: 7, url: "https://github.com/acme-co/widgets/pull/7" });
    expect(subjectLabel(prSubject(prTicket()))).toBe("widgets#7");
    expect(() => prSubject(ticket())).toThrow(/Not a PR card/u);
  });

  it("names a local commit by its short sha and rejects anything that is not a sha and a ref", () => {
    expect(subjectLabel(localSubject(commit, "main"))).toBe("0123456");
    expect(localSubject("abc1234", "origin/release-1.2")).toEqual({ kind: "local", commit: "abc1234", defaultBranch: "origin/release-1.2" });
    expect(() => localSubject("HEAD", "main")).toThrow();
    expect(() => localSubject(commit, "main; rm -rf ~")).toThrow();
    expect(() => localSubject(commit, "-main")).toThrow();
  });
});

describe("review prompt", () => {
  it("checks a local commit out detached and reviews it against its merge base with the default branch, with nothing fetched", () => {
    const prompt = reviewPrompt(localSubject(commit, "main"), ticket(), null, []);
    expect(prompt).toContain(`1. \`git checkout --detach ${commit}\``);
    expect(prompt).toContain('2. `bb kanban review-record --commit "$(git rev-parse HEAD)" --base "main"` so');
    expect(prompt).not.toContain("--head");
    expect(prompt).toContain("with the range `main...HEAD` (three-dot) so it reviews exactly the commits since its merge base with `main`");
    expect(prompt).not.toMatch(/gh pr|git fetch|pull\/|FETCH_HEAD|origin\/\$BASE/u);
  });

  it("numbers a local re-review's steps after its two setup steps", () => {
    const prompt = reviewPrompt(localSubject(commit, "main"), ticket(), review(), [review()]);
    expect(prompt).toContain(`3. Review the new commits. If \`git log ${since}..HEAD\` is empty nothing changed`);
    expect(prompt).toContain("4. Re-check the earlier findings at HEAD.");
    expect(prompt).toContain("When step 3 found nothing changed");
    expect(prompt).toContain("5. Compile one merged report");
    expect(prompt).toContain("the new findings from step 3 plus every open earlier finding");
    expect(prompt).toContain("lists only the reviewers step 3 ran");
    expect(prompt).not.toMatch(/step [45]\b|main\.\.\.HEAD/u);
  });

  it("numbers a PR re-review's steps after its four setup steps", () => {
    const prompt = reviewPrompt(prSubject(prTicket()), prTicket(), review(), [review()]);
    expect(prompt).toContain('4. `bb kanban review-record --commit "$(git rev-parse HEAD)" --base "$BASE" --head "$HEAD_REF"`');
    expect(prompt).toContain(`5. Review the new commits. If \`git log ${since}..HEAD\` is empty nothing changed`);
    expect(prompt).toContain("6. Re-check the earlier findings at HEAD.");
    expect(prompt).toContain("When step 5 found nothing changed");
    expect(prompt).toContain("7. Compile one merged report");
    expect(prompt).toContain("the new findings from step 5 plus every open earlier finding");
    expect(prompt).toContain("lists only the reviewers step 5 ran");
    expect(prompt).not.toMatch(/step [367]\b/u);
  });
});

describe("apply prompt", () => {
  it("applies a local review as a new commit, records it by review id, and never pushes", () => {
    const prompt = localApplyPrompt(ticket(), review(), "- a.ts:1 fix me");
    expect(prompt).toContain("as a new commit on top of it.");
    expect(prompt).toContain("Do not amend or rewrite existing commits.");
    expect(prompt).toContain('`bb kanban review-applied --review r1 --commit "$(git rev-parse HEAD)"`');
    expect(prompt).toContain("Rules: do not push");
    expect(prompt).not.toMatch(/disposable|git fetch|git push|gh pr|--pushed|FETCH_HEAD/u);
  });

  it("fetches the PR head and pushes or stops at a local commit as asked", () => {
    const subject = prSubject(prTicket());
    const pushed = prApplyPrompt(subject, prTicket(), review({ subjectKind: "pr", headRef: "feature" }), true, "- a.ts:1 fix me");
    expect(pushed).toContain('git fetch origin "pull/7/head"');
    expect(pushed).toContain("git push origin HEAD:refs/heads/feature");
    const local = prApplyPrompt(subject, prTicket(), review({ subjectKind: "pr", headRef: "feature" }), false, "- a.ts:1 fix me");
    expect(local).toContain("Do NOT push.");
  });
});
