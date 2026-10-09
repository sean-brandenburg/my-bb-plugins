import type { GLYPH } from "bb-nerd-font";
import type { JiraIssue, PullRequest } from "../shared/board";

/** Marks take the row's muted colour; only a passing or failing check is coloured, since that is the one to act on. */
export interface SourceMark {
  glyph: keyof typeof GLYPH;
  label: string;
  tone?: string;
}

export const PR_STATE_MARK: Record<PullRequest["state"], SourceMark> = {
  open: { glyph: "prOpen", label: "Open pull request" },
  draft: { glyph: "prDraft", label: "Draft pull request" },
  merged: { glyph: "prMerged", label: "Merged pull request" },
  closed: { glyph: "prClosed", label: "Closed pull request" },
};

/** `icon` is the lucide outline drawn without a Nerd Font. */
export const CHECKS_MARK: Record<NonNullable<PullRequest["checks"]>, SourceMark & { icon: string }> = {
  passing: { glyph: "check", icon: "kanban-circle-check", label: "Checks passing", tone: "text-emerald-600 dark:text-emerald-400" },
  failing: { glyph: "x", icon: "kanban-circle-x", label: "Checks failing", tone: "text-destructive" },
  pending: { glyph: "dot", icon: "kanban-circle-dot", label: "Checks pending" },
};

const JIRA_CATEGORY_GLYPH: Record<Exclude<JiraIssue["statusCategory"], "undefined">, SourceMark["glyph"]> = {
  new: "issueOpened",
  indeterminate: "progress",
  done: "issueClosed",
};

/** The status category's glyph, labelled with the status's own name; null when there is no status or category to show. */
export function jiraStatusMark(jira: Pick<JiraIssue, "status" | "statusCategory">): SourceMark | null {
  if (jira.status === "" || jira.statusCategory === "undefined") return null;
  return { glyph: JIRA_CATEGORY_GLYPH[jira.statusCategory], label: jira.status };
}
