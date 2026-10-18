import { describe, expect, it } from "vitest";
import type { Ticket } from "../../shared/board";
import type { Review } from "../../shared/review";
import { applyPrompt, localSubject, prSubject, reviewPrompt, subjectLabel } from "./prompts";

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

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: "r1",
    ticketId: "t1",
    threadId: "thr_review",
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
    const pr = ticket({
      pr: { repo: "acme-co/widgets", number: 7, url: "https://github.com/acme-co/widgets/pull/7", role: "authored", state: "open", author: "me", updatedAt: "", headRef: null, checks: null },
    });
    expect(prSubject(pr)).toEqual({ kind: "pr", repo: "acme-co/widgets", number: 7, url: "https://github.com/acme-co/widgets/pull/7" });
    expect(subjectLabel(prSubject(pr))).toBe("widgets#7");
    expect(() => prSubject(ticket())).toThrow(/Only PR cards/u);
  });

  it("names a local commit by its short sha and rejects anything that is not a sha and a ref", () => {
    expect(subjectLabel(localSubject(commit, "main"))).toBe("0123456");
    expect(localSubject("abc1234", "origin/release-1.2")).toEqual({ kind: "local", commit: "abc1234", defaultBranch: "origin/release-1.2" });
    expect(() => localSubject("HEAD", "main")).toThrow();
    expect(() => localSubject(commit, "main; rm -rf ~")).toThrow();
    expect(() => localSubject(commit, "-main")).toThrow();
  });
});

describe("local review prompt", () => {
  it("checks the commit out detached in the review worktree and reviews it against its merge base with the default branch", () => {
    const prompt = reviewPrompt(localSubject(commit, "main"), ticket(), null, []);
    expect(prompt).toContain(`Run a full code review of the local work on "Cache lookups" at commit ${commit}.`);
    expect(prompt).toContain("this worktree is disposable");
    expect(prompt).toContain(`1. \`git checkout --detach ${commit}\``);
    expect(prompt).toContain('2. `bb kanban review-record --commit "$(git rev-parse HEAD)" --base "main"`');
    expect(prompt).toContain("with the range `main...HEAD` (three-dot) so it reviews exactly the commits since its merge base with `main`");
    expect(prompt).toContain("`Reviewed commit:` line");
    expect(prompt).toContain("do not post comments or reviews on GitHub");
    expect(prompt).toContain("kanban ticket t1");
    expect(prompt).not.toMatch(/gh pr|git fetch|pull\/|FETCH_HEAD|origin\/\$BASE/u);
    expect(prompt).not.toContain("## Earlier findings");
  });

  it("re-reviews the commits since the last reviewed one, numbering its steps after the shorter setup", () => {
    const prompt = reviewPrompt(localSubject(commit, "main"), ticket(), review(), [review()]);
    expect(prompt).toContain(`Re-review the local work on "Cache lookups" at commit ${commit}. The previous review covered commit ${since}.`);
    expect(prompt).toContain(`1. \`git checkout --detach ${commit}\``);
    expect(prompt).toContain(`3. Review the new commits. If \`git log ${since}..HEAD\` is empty nothing changed`);
    expect(prompt).toContain("4. Re-check the earlier findings at HEAD.");
    expect(prompt).toContain("When step 3 found nothing changed");
    expect(prompt).toContain("5. Compile one merged report");
    expect(prompt).toContain("the new findings from step 3 plus every open earlier finding");
    expect(prompt).toContain(`\`"range"\` is \`${since}..HEAD\` and \`"reviewers"\` lists only the reviewers step 3 ran`);
    expect(prompt).not.toMatch(/step 5|main\.\.\.HEAD/u);
    expect(prompt).toContain("### Free-form review r1");
    expect(prompt).toContain("a.ts:1 fix me");
  });
});

describe("local apply prompt", () => {
  it("applies in the card's own environment as a new commit, records the round by review id, and never pushes", () => {
    for (const push of [true, false]) {
      const prompt = applyPrompt(localSubject(commit, "main"), ticket(), review(), push, "- a.ts:1 fix me");
      expect(prompt).toContain('Apply the persisted code review of your work on this card, "Cache lookups", as a new commit on top of it.');
      expect(prompt).toContain(`The review was made against commit ${since}. If \`git rev-parse HEAD\` differs, say so`);
      expect(prompt).toContain("`apply-review` skill");
      expect(prompt).toContain("apply every one as written, without a triage step, a confirmation");
      expect(prompt).toContain("leaving out any unrelated uncommitted work. Do not amend or rewrite existing commits.");
      expect(prompt).toContain('`bb kanban review-applied --review r1 --commit "$(git rev-parse HEAD)"`');
      expect(prompt).toContain("--skipped <ids>");
      expect(prompt).toContain("Rules: do not push");
      expect(prompt).toContain("## Review Findings (persisted)\n\n- a.ts:1 fix me");
      expect(prompt).not.toMatch(/disposable|git fetch|git push|gh pr|--pushed|FETCH_HEAD/u);
    }
  });

  it("asks the thread to note its HEAD when the review recorded no commit", () => {
    const prompt = applyPrompt(localSubject(commit, "main"), ticket(), review({ commitSha: null }), false, "body");
    expect(prompt).toContain("Note `git rev-parse HEAD`.");
    expect(prompt).not.toContain("The review was made against commit");
  });
});
