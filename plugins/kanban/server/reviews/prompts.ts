import type { Ticket } from "../../shared/board";
import type { PrReviewSubject, Review, ReviewSubject } from "../../shared/review";
import { finishSteps } from "../apply-steps";
import { earlierFindings } from "./findings";

/** How a review prompt names its subject, gets the subject's code into the worktree, and what a full review covers. */
interface ReviewSetup {
  /** Completes "Run a full code review of …" and "Re-review …". */
  description: string;
  preamble: string;
  /** Unnumbered; the prompt numbers them, and a re-review's steps continue the count. */
  steps: string[];
  fullRange: string;
  /** Completes "so it reviews exactly …". */
  changesPhrase: string;
}

function reviewSetup(subject: ReviewSubject, ticket: Ticket): ReviewSetup {
  if (subject.kind === "pr") {
    const { repo, number, url } = subject;
    return {
      description: `pull request ${repo}#${number}: "${ticket.title}" (${url})`,
      preamble:
        "Setup (this worktree is disposable; do not touch any other checkout). The `gh` and `git fetch` steps need your GitHub credentials, which the sandbox hides; running them with the sandbox disabled is expected and authorized here, so do that rather than stopping to ask.",
      steps: [
        `\`BASE=$(gh pr view ${number} --repo ${repo} --json baseRefName --jq .baseRefName)\` and \`HEAD_REF=$(gh pr view ${number} --repo ${repo} --json headRefName --jq .headRefName)\``,
        `\`git fetch origin "$BASE" "pull/${number}/head"\``,
        "`git checkout --detach FETCH_HEAD`",
        '`bb kanban review-record --commit "$(git rev-parse HEAD)" --base "$BASE" --head "$HEAD_REF"` so the board knows which commit this review covers.',
      ],
      fullRange: "origin/$BASE...HEAD",
      changesPhrase: "the PR's changes",
    };
  }
  const { commit, defaultBranch } = subject;
  return {
    description: `the local work on "${ticket.title}" at commit ${commit}`,
    preamble:
      "Setup (this worktree is disposable; do not touch any other checkout). Worktrees of this project share one repository, so the commit is already here and nothing needs fetching.",
    steps: [
      `\`git checkout --detach ${commit}\``,
      `\`bb kanban review-record --commit "$(git rev-parse HEAD)" --base "${defaultBranch}"\` so the board knows which commit this review covers.`,
    ],
    fullRange: `${defaultBranch}...HEAD`,
    changesPhrase: `the commits since its merge base with \`${defaultBranch}\``,
  };
}

/**
 * The code-review skill diffs `<default-branch>...HEAD` and its reviewers read whole files, so the subject's head has
 * to be checked out locally. The review runs in its own worktree and checks the head out detached, so it never
 * touches the branch checked out in the main project directory or the card's own environment.
 */
export function reviewPrompt(subject: ReviewSubject, ticket: Ticket, since: Review | null, standing: Review[]): string {
  const setup = reviewSetup(subject, ticket);
  const sinceSha = since?.commitSha ?? null;
  const range = sinceSha === null ? setup.fullRange : `${sinceSha}..HEAD`;
  return [
    sinceSha === null
      ? `Run a full code review of ${setup.description}.`
      : `Re-review ${setup.description}. The previous review covered commit ${sinceSha}. Review what changed since then, and re-check the earlier findings listed at the end of this prompt so every one still unaddressed carries forward into this review.`,
    "",
    setup.preamble,
    ...setup.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    ...(sinceSha === null
      ? [
          `Then invoke the \`code-review\` skill with the range \`${range}\` (three-dot) so it reviews exactly ${setup.changesPhrase}. Let it spawn every applicable reviewer in parallel and compile the findings in its standard format.`,
          "",
          "Your final message must be the code-review skill's compiled report verbatim, including its `Reviewed commit:` line and the trailing ```json review-findings block; it is persisted on the card and rendered from that JSON.",
        ]
      : incrementalSteps(range, setup.steps.length + 1)),
    "Rules: do not change code, and do not post comments or reviews on GitHub; the compiled findings in this thread are the deliverable.",
    `This review belongs to kanban ticket ${ticket.id}.`,
    ...(sinceSha === null ? [] : ["", ...earlierFindingsSection(standing)]),
  ].join("\n");
}

/** A re-review is only complete when it also says which earlier findings are still open, so the latest review alone stands for the subject. */
function incrementalSteps(range: string, reviewStep: number): string[] {
  return [
    `${reviewStep}. Review the new commits. If \`git log ${range}\` is empty nothing changed, so skip this step. Otherwise invoke the \`code-review\` skill with the range \`${range}\` and let it spawn its reviewers and compile their findings; that report is an intermediate result, not your final message.`,
    `${reviewStep + 1}. Re-check the earlier findings at HEAD. Spawn one general-purpose subagent with them and have it read the code at HEAD and classify each as addressed (the problem no longer exists) or open (still present; give its current locations, since lines may have moved). Changed lines or an apply round that targeted a finding do not make it addressed; only the code at HEAD does. When step ${reviewStep} found nothing changed, every earlier finding is open as listed and needs no check.`,
    `${reviewStep + 2}. Compile one merged report in the code-review skill's exact format (the markdown sections, the \`Reviewed commit:\` and \`Range:\` lines, and the trailing \`\`\`json review-findings block), with these additions:`,
    `   - \`findings\` holds the new findings from step ${reviewStep} plus every open earlier finding, merged into one where a new finding is the same problem as an earlier one, ordered by severity and renumbered \`F1\`, \`F2\`, ….`,
    '   - A carried finding keeps its earlier title, description, fix, severity, scores, flaggedBy and category unless the new commits made them inaccurate, takes its locations at HEAD, and sets `"carriedFrom"` to its earlier handle; its markdown line ends with `(carried from <handle>)`. New findings set `"carriedFrom": null`. Points still open from an earlier free-form review become findings with `"carriedFrom"` set to that review\'s id.',
    '   - Set `"carriesForward": true` and list each addressed earlier finding in `"resolved"` as `{ "id": "<handle>", "title": "<earlier title>", "note": "<how it was addressed>" }`; in the markdown, list them under a `### Resolved since the last review` heading inside `## Review Findings`.',
    `   - \`"range"\` is \`${range}\` and \`"reviewers"\` lists only the reviewers step ${reviewStep} ran (none when nothing changed).`,
    "",
    "Your final message must be that merged report, including its `Reviewed commit:` line and the trailing ```json review-findings block; it is persisted on the card, rendered from that JSON, and replaces the earlier reviews' findings on the board.",
  ];
}

function earlierFindingsSection(standing: Review[]): string[] {
  const findings = earlierFindings(standing);
  const freeForm = standing.filter((review) => review.report === null && review.body !== null && review.body.trim() !== "");
  const lines = ["## Earlier findings", ""];
  if (findings.length === 0 && freeForm.length === 0) return [...lines, "The earlier reviews left no open findings, so `resolved` is empty and every finding is new."];
  if (findings.length > 0) {
    lines.push(
      "Each is keyed by its `handle`; `applyRound` says what the board's apply round did with it.",
      "",
      "```json",
      JSON.stringify(findings, null, 2),
      "```",
    );
  }
  for (const review of freeForm) lines.push("", `### Free-form review ${review.id}`, "", review.body!.trim());
  return lines;
}

const APPLY_AS_GIVEN =
  "invoke the `apply-review` skill with the findings below. The user selected them on the Kanban board, so they are already triaged: apply every one as written, without a triage step, a confirmation, or dropping or reshaping any. Report any you could not apply and why.";
const SKIPPED_NOTE =
  "The board crosses off every finding handed to this round once it is recorded. If you could not apply some, add `--skipped <ids>` (comma-separated finding ids, e.g. `--skipped F2,F5`) to that command so they stay open.";

function applyDrift(review: Review): string {
  return review.commitSha === null
    ? "Note `git rev-parse HEAD`."
    : `The review was made against commit ${review.commitSha}. If \`git rev-parse HEAD\` differs, say so and check each finding still applies before fixing it.`;
}

function applyFooter(ticket: Ticket, review: Review, findingsBody: string): string[] {
  return [`This apply run belongs to kanban ticket ${ticket.id}, review ${review.id}.`, "", "## Review Findings (persisted)", "", findingsBody];
}

/**
 * A local review is applied by the card's own thread, which already has the commit checked out on its branch, so the
 * prompt sets nothing up. It names the review by id because the card's thread outlives any one review's apply round.
 */
export function localApplyPrompt(ticket: Ticket, review: Review, findingsBody: string): string {
  return [
    `Apply the persisted code review of your work on this card, "${ticket.title}", as a new commit on top of it.`,
    "",
    applyDrift(review),
    "",
    `Then ${APPLY_AS_GIVEN}`,
    "",
    "When the skill reports done and verification passed:",
    '1. Commit the fixes with `git commit -m "Apply code review findings"` (use a more specific message if the changes are narrow), leaving out any unrelated uncommitted work. Do not amend or rewrite existing commits.',
    `2. \`bb kanban review-applied --review ${review.id} --commit "$(git rev-parse HEAD)"\` so the board records the commit.`,
    SKIPPED_NOTE,
    "",
    "Rules: do not push, never post comments or reviews on GitHub, and report the result and any findings you could not apply.",
    ...applyFooter(ticket, review, findingsBody),
  ].join("\n");
}

/** A PR review is applied by a fresh thread that fetches the PR head, then pushes the fixes to its branch or stops at a local commit. */
export function prApplyPrompt(subject: PrReviewSubject, ticket: Ticket, review: Review, push: boolean, findingsBody: string): string {
  const { repo, number, url } = subject;
  const headRef = review.headRef ?? `$(gh pr view ${number} --repo ${repo} --json headRefName --jq .headRefName)`;
  return [
    `Apply the persisted code review to pull request ${repo}#${number}: "${ticket.title}" (${url})${push ? " and push the fixes to its branch" : " as a local commit in this worktree"}.`,
    "",
    "Setup (this worktree is disposable; do not touch any other checkout). `git fetch`, `git push`, and `gh` need your credentials, which the sandbox hides; running them with the sandbox disabled is expected and authorized here.",
    `1. \`git fetch origin "pull/${number}/head"\` then \`git checkout --detach FETCH_HEAD\`.`,
    `2. ${applyDrift(review)}`,
    "",
    `Then ${APPLY_AS_GIVEN}`,
    "",
    ...finishSteps(push, headRef, "bb kanban review-applied", "Apply code review findings"),
    SKIPPED_NOTE,
    "",
    "Rules: never force-push, never post comments or reviews on GitHub, and report the result and any findings you could not apply.",
    ...applyFooter(ticket, review, findingsBody),
  ].join("\n");
}
