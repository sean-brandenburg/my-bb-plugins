import { GLYPH, Glyph, useNerdFont } from "bb-nerd-font";
import type { PullRequest, Ticket } from "../shared/board";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { dueStatus } from "./format";
import { ExternalLink, Badge } from "./primitives";
import { CHECKS_MARK, PR_STATE_MARK, jiraStatusMark, type SourceMark } from "./source-marks";

/** Nerd Font Mono glyphs fill a cell, so a point above the 11px text matches the lucide icons' optical size. */
const GLYPH_SIZE = "text-[12px]";

export function MarkGlyph({ mark }: { mark: SourceMark }) {
  return <Glyph glyph={GLYPH[mark.glyph]} label={mark.label} title={mark.label} className={cn(GLYPH_SIZE, mark.tone)} />;
}

export function PrStateGlyph({ state }: { state: PullRequest["state"] }) {
  return <MarkGlyph mark={PR_STATE_MARK[state]} />;
}

/** The head commit's CI result. */
export function ChecksMark({ checks, nerdFont }: { checks: NonNullable<PullRequest["checks"]>; nerdFont: boolean }) {
  const mark = CHECKS_MARK[checks];
  if (nerdFont) return <MarkGlyph mark={mark} />;
  return (
    <span role="img" aria-label={mark.label} title={mark.label} className={cn("inline-flex shrink-0", mark.tone)}>
      <Icon name={mark.icon} className="size-3" />
    </span>
  );
}

/** The PR's head branch; the name truncates, the icon stays. */
export function BranchName({ headRef, nerdFont, className }: { headRef: string; nerdFont: boolean; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1 overflow-hidden", className)} title={headRef}>
      {nerdFont ? <Glyph glyph={GLYPH.branch} className={GLYPH_SIZE} /> : <Icon name="kanban-git-branch" className="size-3 shrink-0" />}
      <span className="truncate">{headRef}</span>
    </span>
  );
}

export function JiraGlyph() {
  return <Glyph glyph={GLYPH.jira} className={GLYPH_SIZE} />;
}

export function PrBadges({ ticket }: { ticket: Ticket }) {
  const nerdFont = useNerdFont();
  if (ticket.pr === null) return null;
  const { pr } = ticket;
  const repoName = pr.repo.split("/")[1] ?? pr.repo;
  const stateTone =
    pr.state === "merged" ? "success" : pr.state === "closed" ? "danger" : pr.state === "draft" ? "neutral" : "accent";
  return (
    <>
      <ExternalLink href={pr.url} title={`Open ${pr.repo}#${pr.number} on GitHub`} className="inline-flex max-w-full">
        <Badge title={pr.repo}>
          {nerdFont ? <PrStateGlyph state={pr.state} /> : <Icon name="GitPullRequest" className="size-3" />}
          {repoName}#{pr.number}
          {pr.checks !== null ? <ChecksMark checks={pr.checks} nerdFont={nerdFont} /> : null}
        </Badge>
      </ExternalLink>
      {!nerdFont && pr.state !== "open" ? <Badge tone={stateTone}>{pr.state}</Badge> : null}
      {pr.headRef !== null ? (
        <Badge className="max-w-48">
          <BranchName headRef={pr.headRef} nerdFont={nerdFont} />
        </Badge>
      ) : null}
    </>
  );
}

export function JiraBadges({ ticket }: { ticket: Ticket }) {
  const nerdFont = useNerdFont();
  if (ticket.jira === null) return null;
  const { jira } = ticket;
  const tone = jira.statusCategory === "done" ? "success" : jira.statusCategory === "indeterminate" ? "accent" : "neutral";
  const statusMark = nerdFont ? jiraStatusMark(jira) : null;
  return (
    <>
      <ExternalLink href={jira.url} title={`Open ${jira.key} in Jira`} className="inline-flex max-w-full">
        <Badge title={jira.issueType}>
          {nerdFont ? <JiraGlyph /> : <Icon name="kanban-ticket" className="size-3" />}
          {jira.key}
          {statusMark !== null ? <MarkGlyph mark={statusMark} /> : null}
        </Badge>
      </ExternalLink>
      {statusMark === null && jira.status !== "" ? <Badge tone={tone}>{jira.status}</Badge> : null}
      {jira.priority !== null ? <Badge title="Priority">{jira.priority}</Badge> : null}
    </>
  );
}

export function ReviewBadge({ ticket }: { ticket: Ticket }) {
  const review = ticket.latestReview;
  if (review === null) return null;
  if (review.status === "running") return <Badge tone="accent">reviewing…</Badge>;
  if (review.status === "failed") return <Badge tone="danger">review failed</Badge>;
  if (review.apply !== null && review.apply.completedAt === null) return <Badge tone="accent">applying…</Badge>;
  if (review.apply !== null) {
    return <Badge tone="success" title={`Fixes pushed as ${review.apply.pushedCommit ?? "unknown"}`}>applied</Badge>;
  }
  const counts = review.counts;
  if (counts === null) return <Badge title={`Reviewed at commit ${review.commitSha ?? "unknown"}`}>reviewed</Badge>;
  const total = counts.critical + counts.important + counts.minor;
  if (total === 0) return <Badge tone="success">no findings</Badge>;
  return (
    <Badge
      tone={counts.critical > 0 ? "danger" : counts.important > 0 ? "warning" : "neutral"}
      title={`${counts.critical} critical, ${counts.important} important, ${counts.minor} minor`}
    >
      {total} finding{total === 1 ? "" : "s"}
      {review.selectedCount !== null ? ` · ${review.selectedCount} to apply` : ""}
    </Badge>
  );
}

export function DueBadge({ ticket, today, isDone }: { ticket: Ticket; today: string; isDone: boolean }) {
  if (ticket.dueDate === null) return null;
  const due = dueStatus(ticket.dueDate, today);
  const tone = isDone ? "neutral" : due.tone === "overdue" ? "danger" : due.tone === "soon" ? "warning" : "neutral";
  return (
    <Badge tone={tone} title={due.title}>
      <Icon name="kanban-calendar" className="size-3" />
      {due.label}
    </Badge>
  );
}
