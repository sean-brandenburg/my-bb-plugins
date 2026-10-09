import type { GLYPH } from "bb-nerd-font";
import type { JiraIssue, PullRequest } from "../shared/board";

export interface SourceMark {
  glyph: keyof typeof GLYPH;
  label: string;
  tone: string;
}

const GOOD = "text-emerald-600 dark:text-emerald-400";
const QUIET = "text-muted-foreground";

export const PR_STATE_MARK: Record<PullRequest["state"], SourceMark> = {
  open: { glyph: "prOpen", label: "Open pull request", tone: GOOD },
  draft: { glyph: "prDraft", label: "Draft pull request", tone: QUIET },
  merged: { glyph: "prMerged", label: "Merged pull request", tone: "text-violet-700 dark:text-violet-300" },
  closed: { glyph: "prClosed", label: "Closed pull request", tone: "text-destructive" },
};

/** `icon` is the lucide outline drawn without a Nerd Font. */
export const CHECKS_MARK: Record<NonNullable<PullRequest["checks"]>, SourceMark & { icon: string }> = {
  passing: { glyph: "check", icon: "kanban-circle-check", label: "Checks passing", tone: GOOD },
  failing: { glyph: "x", icon: "kanban-circle-x", label: "Checks failing", tone: "text-destructive" },
  pending: { glyph: "dot", icon: "kanban-circle-dot", label: "Checks pending", tone: "text-amber-600 dark:text-amber-400" },
};

const JIRA_CATEGORY_MARK: Record<Exclude<JiraIssue["statusCategory"], "undefined">, Omit<SourceMark, "label">> = {
  new: { glyph: "issueOpened", tone: QUIET },
  indeterminate: { glyph: "progress", tone: "text-sky-600 dark:text-sky-400" },
  done: { glyph: "issueClosed", tone: GOOD },
};

/** The status category's glyph, labelled with the status's own name; null when there is no status or category to show. */
export function jiraStatusMark(jira: Pick<JiraIssue, "status" | "statusCategory">): SourceMark | null {
  if (jira.status === "" || jira.statusCategory === "undefined") return null;
  return { ...JIRA_CATEGORY_MARK[jira.statusCategory], label: jira.status };
}
