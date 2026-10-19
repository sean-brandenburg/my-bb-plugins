import type { Ticket } from "../../shared/board";
import type { Finding } from "../../shared/review";
import { findingLines } from "../reviews/findings";
import { commitCheckout } from "../reviews/prompts";
import type { CardPrompt } from "./reducer";

/** Lines of the check command's output a checks thread records. */
const CHECKS_TAIL_LINES = 200;

/**
 * What a monitored card's thread is held to, in its instructions and when monitoring starts. `checkCommand` is the
 * project's; without one the agent picks the command and names it.
 */
export function builderContract(isPr: boolean, checkCommand: string | null): string {
  const commit = isPr ? "commit it and push it to the PR branch (never force-push)" : "commit it on your branch (do not push)";
  const checks =
    checkCommand === null
      ? "run the project's checks (choose the command that builds, lints and tests it; the project sets none)"
      : `run the project's check command \`${checkCommand}\``;
  const agentChosen = checkCommand === null ? ' --check-command "<the command you ran>"' : "";
  return [
    "The board monitors this card and runs its review loop, so never move the card yourself; the board moves it.",
    `When the work is done, ${commit}, ${checks} and fix what fails.`,
    `Then finish with \`bb kanban ready --commit "$(git rev-parse HEAD)"${agentChosen} --evidence-stdin\`, giving on stdin JSON evidence of how you verified the work: \`{"commands":[{"command":"…","exitCode":0,"outputTail":"its last lines"}],"screenshots":["/absolute/path.png"]}\` (screenshots for UI changes).`,
    "Then stop: the board re-runs the checks in a fresh worktree and reviews the commit, and sends failing checks or the findings to fix back to this thread.",
  ].join(" ");
}

/** A fence longer than any the output is likely to hold. */
const OUTPUT_FENCE = "~~~~~";

/** The words for each prompt the loop sends into the card's thread. */
export function cardPromptText(prompt: Exclude<CardPrompt, { kind: "fix" }>, ticket: Ticket, checkCommand: string | null): string {
  switch (prompt.kind) {
    case "monitoring":
      return [
        `The board now monitors this card, "${ticket.title}", and runs its review loop.`,
        "",
        builderContract(ticket.pr !== null, checkCommand),
        "",
        "If you are still working, or waiting on the user, carry on as you were; report ready only once the work is done.",
      ].join("\n");
    case "checks-failed":
      return [
        `The board re-ran \`${prompt.command}\` at commit ${prompt.commit} in a fresh worktree, and it failed with exit code ${prompt.exitCode}. No review ran.`,
        "",
        "The end of its output:",
        "",
        OUTPUT_FENCE,
        prompt.outputTail.trimEnd(),
        OUTPUT_FENCE,
        "",
        "Fix what makes it fail, commit, run the checks yourself, and report with `bb kanban ready` again. Never move the card.",
      ].join("\n");
  }
}

/** A fix round: the review's findings triaged apply, which the card's thread fixes in one commit before reporting ready. */
export function fixPromptText(ticket: Ticket, round: number, reviewedCommit: string | null, findings: Finding[]): string {
  const commit = ticket.pr === null ? "Commit the fixes on your branch (do not push)" : "Commit the fixes and push them to the PR branch (never force-push)";
  return [
    `The board's code review${reviewedCommit === null ? "" : ` of commit ${reviewedCommit}`} found ${findings.length === 1 ? "a finding" : `${findings.length} findings`} to fix in this change, "${ticket.title}". This is round ${round} of the review loop.`,
    "",
    "Fix exactly these findings, and nothing beyond them. A finding's locations are every instance of its bug class: fix the class in full, at every instance, but add no refactors, features or clean-ups the findings don't ask for. The next review checks that the fix commits stay within these findings.",
    "",
    ...findingLines(findings),
    `${commit}, run the checks again, and report with \`bb kanban ready\` as before. Never move the card.`,
  ].join("\n");
}

/** A short hidden thread that re-runs the check command at the reported commit, independently of the agent that wrote it. */
export function checksPrompt(ticket: Ticket, commit: string, command: string): string {
  const { preamble, steps } = commitCheckout(ticket, commit);
  const run = `log=$(mktemp); ( ${command} ) >"$log" 2>&1; code=$?; tail -n ${CHECKS_TAIL_LINES} "$log" | bb kanban checks-record --exit-code "$code" --output-stdin`;
  return [
    `Re-run the checks of "${ticket.title}" at commit ${commit}. Its agent reported the work ready; this run checks that independently, so report what the command does and change nothing.`,
    "",
    preamble,
    ...[
      ...steps,
      "Prepare the worktree the way the project needs before its checks can run, such as installing dependencies, without editing tracked files. Installing may need the network, which the sandbox can block; running the install with the sandbox disabled is expected and authorized here.",
      `Run the check command from the repository root and record its result in one go: \`${run}\``,
    ].map((step, index) => `${index + 1}. ${step}`),
    "",
    "Rules: do not change, commit or push code, do not try to fix a failure, and do not post on GitHub. If the command can't run at all (a missing tool, say), still record its exit code. End your final message with the line `Checks exit code: <code>`.",
    `This checks run belongs to kanban ticket ${ticket.id}.`,
  ].join("\n");
}
