import type { Ticket } from "../shared/board";
import { Icon } from "@/components/ui/icon";
import { dueStatus } from "./format";
import { ExternalLink, Badge } from "./primitives";

export function PrBadges({ ticket }: { ticket: Ticket }) {
  if (ticket.pr === null) return null;
  const { pr } = ticket;
  const repoName = pr.repo.split("/")[1] ?? pr.repo;
  const stateTone =
    pr.state === "merged" ? "success" : pr.state === "closed" ? "danger" : pr.state === "draft" ? "neutral" : "accent";
  return (
    <>
      <ExternalLink href={pr.url} title={`Open ${pr.repo}#${pr.number} on GitHub`} className="inline-flex max-w-full">
        <Badge title={pr.repo}>
          <Icon name="GitPullRequest" className="size-3" />
          {repoName}#{pr.number}
        </Badge>
      </ExternalLink>
      {pr.state !== "open" ? <Badge tone={stateTone}>{pr.state}</Badge> : null}
    </>
  );
}

export function JiraBadges({ ticket }: { ticket: Ticket }) {
  if (ticket.jira === null) return null;
  const { jira } = ticket;
  const tone = jira.statusCategory === "done" ? "success" : jira.statusCategory === "indeterminate" ? "accent" : "neutral";
  return (
    <>
      <ExternalLink href={jira.url} title={`Open ${jira.key} in Jira`} className="inline-flex max-w-full">
        <Badge title={jira.issueType}>
          <Icon name="kanban-ticket" className="size-3" />
          {jira.key}
        </Badge>
      </ExternalLink>
      {jira.status !== "" ? <Badge tone={tone}>{jira.status}</Badge> : null}
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
