import { useEffect, useState } from "react";
import { Markdown } from "@get-bb/plugin-sdk/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { OPACITY_TRANSITION, PRESS, STAGGER, enter, speed, stagger, usePopOnChange, POPOVER_MOTION } from "bb-motion";
import type { Ticket } from "../shared/board";
import { locationLabel } from "../shared/finding-location";
import type { Finding, FindingSeverity, Review } from "../shared/review";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { shortSha } from "./format";
import { type Rpc, usePushPreference } from "./data";
import { PushToggle, Badge, ThreadStatusDot, COMPACT, Group, MENU_ITEM_CLASS } from "./primitives";
import { type RunAction, toastError } from "./actions";

const SEVERITY_LABEL: Record<FindingSeverity, string> = { critical: "Critical", important: "Important", minor: "Minor" };
const SEVERITY_TONE: Record<FindingSeverity, "danger" | "warning" | "neutral"> = {
  critical: "danger",
  important: "warning",
  minor: "neutral",
};

function SeverityCountBadges({ counts, appliedCount }: { counts: NonNullable<Ticket["latestReview"]>["counts"]; appliedCount: number }) {
  if (counts === null) return null;
  const total = counts.critical + counts.important + counts.minor;
  if (total === 0) return <Badge tone="success">{appliedCount > 0 ? "all applied" : "no findings"}</Badge>;
  return (
    <>
      {(["critical", "important", "minor"] as const)
        .filter((severity) => counts[severity] > 0)
        .map((severity) => (
          <Badge key={severity} tone={SEVERITY_TONE[severity]} title={`${counts[severity]} ${SEVERITY_LABEL[severity].toLowerCase()} finding(s)`}>
            {counts[severity]} {severity}
          </Badge>
        ))}
    </>
  );
}

function FindingCard({
  finding,
  index,
  selected,
  overridden,
  applied,
  onToggle,
  onApplied,
}: {
  finding: Finding;
  /** Position across all severity groups, so the whole report cascades as one list. */
  index: number;
  selected: boolean | null;
  overridden: boolean;
  /** An apply round fixed it (or the user crossed it off); it is folded to its title and kept out of the next round. */
  applied: boolean;
  onToggle: ((selected: boolean) => void) | null;
  onApplied: ((applied: boolean) => void) | null;
}) {
  const appliedPop = usePopOnChange(applied);
  return (
    <li style={stagger(index)} className={cn("rounded-md border border-border bg-card p-2.5", enter.rise, speed.fast, STAGGER, OPACITY_TRANSITION, (selected === false || applied) && "opacity-60")}>
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        {selected !== null && onToggle !== null && !applied ? (
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onToggle(checked === true)}
            aria-label={`${selected ? "Exclude" : "Include"} ${finding.id} in the apply round`}
            className="mt-0.5"
          />
        ) : null}
        <Badge tone={applied ? "success" : SEVERITY_TONE[finding.severity]}>{finding.id}</Badge>
        <span className={cn("min-w-0 flex-1 text-sm font-medium leading-5", applied && "text-muted-foreground line-through")}>{finding.title}</span>
        {applied ? <Badge tone="success">applied</Badge> : null}
        {finding.importance !== null && finding.scopeFit !== null ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title="importance / scope fit (1–5)">
            {finding.importance}/{finding.scopeFit}
          </span>
        ) : null}
        {finding.carriedFrom !== null ? (
          <span className="shrink-0 text-xs text-muted-foreground" title={`Still open from an earlier review, where it was ${finding.carriedFrom.split("/").pop()}`}>
            carried
          </span>
        ) : null}
        {overridden && !applied ? <span className="shrink-0 text-xs text-muted-foreground" title="You changed this from the suggested selection">manual</span> : null}
        {onApplied !== null ? (
          <button
            type="button"
            aria-label={applied ? `Reopen ${finding.id}` : `Mark ${finding.id} as applied`}
            title={applied ? "Reopen: show it in the diff and let the next apply round take it" : "Mark as applied: cross it off and hide it from the diff"}
            className={cn(
              "-my-0.5 flex size-6 shrink-0 items-center justify-center rounded hover:bg-state-hover",
              PRESS,
              applied ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onApplied(!applied)}
          >
            {/* The pop lives on a wrapper so remounting it never takes focus from the button. */}
            <span key={appliedPop.key} onAnimationEnd={appliedPop.onAnimationEnd} className={cn("flex", appliedPop.className)}>
              <Icon name="CircleCheck" className="size-3.5" />
            </span>
          </button>
        ) : null}
      </div>
      {applied ? null : <FindingDetails finding={finding} />}
    </li>
  );
}

function FindingDetails({ finding }: { finding: Finding }) {
  return (
    <>
      {finding.locations.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {finding.locations.map((location) => (
            <code key={locationLabel(location)} className="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">
              {locationLabel(location)}
            </code>
          ))}
        </div>
      ) : null}
      {finding.description !== "" ? <Markdown content={finding.description} className="mt-1.5 text-sm" /> : null}
      {finding.fix !== null && finding.fix !== "" ? (
        <div className="mt-1.5 flex gap-1.5 text-sm">
          <Icon name="kanban-wrench" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <Markdown content={finding.fix} className="min-w-0 flex-1" />
        </div>
      ) : null}
      {finding.flaggedBy.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {finding.flaggedBy.map((reviewer) => (
            <Badge key={reviewer}>{reviewer}</Badge>
          ))}
        </div>
      ) : null}
    </>
  );
}

function StructuredReview({
  review,
  onToggle,
  onReset,
  onApplied,
}: {
  review: Review;
  /** Null makes the view read-only (old reviews). */
  onToggle: ((findingId: string, selected: boolean) => void) | null;
  onReset: (() => void) | null;
  onApplied: ((findingId: string, applied: boolean) => void) | null;
}) {
  const report = review.report!;
  const grouped = (["critical", "important", "minor"] as const)
    .map((severity) => ({ severity, findings: report.findings.filter((finding) => finding.severity === severity) }))
    .filter((group) => group.findings.length > 0);
  const applied = new Set(review.appliedFindingIds);
  const openCount = report.findings.filter((finding) => !applied.has(finding.id)).length;
  const selectedCount = report.findings.filter((finding) => review.selection[finding.id] === true && !applied.has(finding.id)).length;
  const overriddenCount = Object.keys(review.selectionOverrides).length;
  return (
    <div className="flex flex-col gap-3">
      {report.summary !== "" ? <Markdown content={report.summary} className="text-sm" /> : null}
      {report.findings.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span title={overriddenCount > 0 ? `${overriddenCount} changed by you` : "Suggested: critical, or importance ≥ 3 and scope ≥ 3"}>
            <span className="font-medium text-foreground tabular-nums">{selectedCount}</span> of {openCount} open selected
            {applied.size > 0 ? <> · <span className="tabular-nums">{report.findings.length - openCount}</span> applied</> : null}
          </span>
          {onReset !== null && overriddenCount > 0 ? (
            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onReset}>
              Reset to suggested
            </Button>
          ) : null}
        </div>
      ) : null}
      {grouped.length === 0 ? <p className={cn("text-sm text-muted-foreground", enter.fade)}>No findings.</p> : null}
      {grouped.map(({ severity, findings }, groupIndex) => (
        <section key={severity} aria-label={SEVERITY_LABEL[severity]}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {SEVERITY_LABEL[severity]} <span className="font-normal tabular-nums">{findings.length}</span>
          </h3>
          <ul className="flex flex-col gap-2">
            {findings.map((finding, index) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                index={grouped.slice(0, groupIndex).reduce((sum, group) => sum + group.findings.length, 0) + index}
                selected={review.selection[finding.id] ?? null}
                overridden={finding.id in review.selectionOverrides}
                applied={applied.has(finding.id)}
                onToggle={onToggle === null ? null : (selected) => onToggle(finding.id, selected)}
                onApplied={onApplied === null ? null : (isApplied) => onApplied(finding.id, isApplied)}
              />
            ))}
          </ul>
        </section>
      ))}
      {report.resolved.length > 0 ? (
        <section aria-label="Resolved since the last review">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Resolved since the last review <span className="font-normal tabular-nums">{report.resolved.length}</span>
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {report.resolved.map((entry) => (
              <li key={entry.id} className="flex gap-1.5">
                <Icon name="Check" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="text-muted-foreground line-through">{entry.title === "" ? entry.id.split("/").pop() : entry.title}</span>
                  {entry.note !== "" ? <span className="text-muted-foreground"> — {entry.note}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {report.skippedFiles.length > 0 ? (
        <p className="text-xs text-muted-foreground">Skipped generated files: {report.skippedFiles.join(", ")}</p>
      ) : null}
    </div>
  );
}

function ReviewStatusChips({ review }: { review: Ticket["latestReview"] }) {
  if (review === null) return null;
  if (review.status === "running") return <Badge tone="accent">Reviewing…</Badge>;
  if (review.status === "failed") return <Badge tone="danger">failed</Badge>;
  return (
    <span className="inline-flex items-center gap-1" title={`Reviewed at ${review.commitSha ?? "unknown"}${review.sinceCommitSha !== null ? ` (since ${review.sinceCommitSha})` : ""}`}>
      <SeverityCountBadges counts={review.counts} appliedCount={review.appliedCount} />
    </span>
  );
}

export function ReviewPanel({
  ticket,
  threads,
  rpc,
  pending,
  canReview,
  run,
  onOpenThread,
}: {
  ticket: Ticket;
  threads: ReadonlyMap<string, PluginSidebarThread>;
  rpc: Rpc;
  pending: boolean;
  canReview: boolean;
  run: RunAction;
  onOpenThread: (threadId: string) => void;
}) {
  const [push, setPush] = usePushPreference();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const review = ticket.latestReview;
  const showFindings = review !== null && review.hasBody;
  useEffect(() => {
    if (!showFindings) return;
    let cancelled = false;
    rpc.call("review_list", { ticketId: ticket.id }).then(
      (result) => {
        if (!cancelled) setReviews(result.reviews);
      },
      toastError,
    );
    return () => {
      cancelled = true;
    };
  }, [showFindings, ticket.id, ticket.latestReview?.completedAt, ticket.latestReview?.selectedCount, ticket.latestReview?.appliedCount, rpc]);

  const applying = review?.apply !== null && review?.apply !== undefined && review.apply.completedAt === null;
  const selectedCount = review?.selectedCount ?? null;
  const updateReview = (updated: Review) =>
    setReviews((current) => (current === null ? current : current.map((entry) => (entry.id === updated.id ? updated : entry))));
  const toggleFinding = (reviewId: string, findingId: string, selected: boolean) =>
    rpc.call("review_set_selection", { reviewId, findingId, selected }).then(updateReview, toastError);
  const resetSelection = (reviewId: string) =>
    rpc.call("review_reset_selection", { reviewId }).then(updateReview, toastError);
  const setApplied = (reviewId: string, findingId: string, applied: boolean) =>
    rpc.call("review_set_applied", { reviewId, findingId, applied }).then(updateReview, toastError);
  const startReview = (mode: "full" | "incremental") =>
    void run(() => rpc.call("ticket_review_pr", { id: ticket.id, projectId: null, mode }), "Review started");
  const canStart = canReview && !pending && review?.status !== "running";
  const canIncremental = review?.status === "completed" && review.commitSha !== null;

  const menu = review === null ? null : (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Review options">
          <Icon name="MoreHorizontal" className="size-4" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content {...usePortalScopeProps()} align="end" sideOffset={4} className={cn("z-50 min-w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md", POPOVER_MOTION)}>
          {review.apply !== null ? (
            <>
              <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={() => onOpenThread(review.apply!.threadId)}>
                <Icon name="kanban-wrench" className="size-4 text-muted-foreground" />
                Open apply thread
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
            </>
          ) : null}
          {canIncremental ? (
            <DropdownMenu.Item className={MENU_ITEM_CLASS} disabled={!canStart} onSelect={() => startReview("incremental")}>
              <Icon name="kanban-search-check" className="size-4 text-muted-foreground" />
              Review changes since {shortSha(review.commitSha)}
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item className={MENU_ITEM_CLASS} disabled={!canStart} onSelect={() => startReview("full")} title="Starts over: earlier findings and your choices on them are not carried forward">
            <Icon name="kanban-refresh" className="size-4 text-muted-foreground" />
            Run a full review again
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  return (
    <Group title="Code review" summary={<ReviewStatusChips review={review} />} menu={menu} defaultOpen>
      {review === null ? (
        <div className="flex flex-wrap items-center gap-2">
          <span title={canReview ? "Runs the code-review skill on the PR in its own worktree" : "Start the card's thread in a project first; reviews run there"}>
            <Button type="button" variant="secondary" className={COMPACT} disabled={!canStart} onClick={() => startReview("full")}>
              <Icon name="kanban-search-check" className="size-3.5" />
              Review this PR
            </Button>
          </span>
        </div>
      ) : review.status === "running" ? (
        <button type="button" onClick={() => onOpenThread(review.threadId)} className="flex items-center gap-2 text-left text-sm text-muted-foreground hover:text-foreground">
          <ThreadStatusDot thread={threads.get(review.threadId)} />
          Reviewing… open thread
        </button>
      ) : review.status === "failed" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" className={COMPACT} disabled={!canStart} onClick={() => startReview("full")}>
            <Icon name="kanban-refresh" className="size-3.5" />
            Retry review
          </Button>
          <button type="button" onClick={() => onOpenThread(review.threadId)} className="text-xs text-muted-foreground hover:text-foreground">
            See why it failed
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span title={selectedCount === 0 ? "Tick at least one open finding to apply" : "Applies the selected findings that are still open"}>
              <Button
                type="button"
                variant="secondary"
                className={COMPACT}
                disabled={pending || applying || !review.hasBody || selectedCount === 0}
                onClick={() =>
                  void run(() => rpc.call("review_apply", { ticketId: ticket.id, reviewId: review.id, push }), "Apply thread started")
                }
              >
                <Icon name="kanban-wrench" className="size-3.5" />
                {applying ? "Applying…" : `Apply ${selectedCount ?? ""}${selectedCount === null ? "review" : selectedCount === 1 ? " finding" : " findings"}`}
              </Button>
            </span>
            <PushToggle push={push} onChange={setPush} disabled={pending || applying} />
            <button type="button" className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => onOpenThread(review.threadId)}>
              <Icon name="MessageSquare" className="size-3.5" />
              Review thread
            </button>
            {review.apply !== null ? (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onOpenThread(review.apply!.threadId)}
              >
                <ThreadStatusDot thread={threads.get(review.apply.threadId)} />
                {review.apply.completedAt === null
                  ? "Apply thread running"
                  : review.apply.push
                    ? `Pushed ${shortSha(review.apply.pushedCommit)}`
                    : `Committed ${shortSha(review.apply.pushedCommit)}, not pushed`}
              </button>
            ) : null}
          </div>
          {showFindings ? (
            <div className="flex flex-col gap-3 text-sm">
              {reviews === null ? (
                <p className={cn("text-muted-foreground", enter.fade)}>Loading…</p>
              ) : (
                <>
                  {(() => {
                    const latest = reviews.find((entry) => entry.id === review.id);
                    if (latest === undefined || latest.body === null) return null;
                    return latest.report !== null ? (
                      <StructuredReview
                        review={latest}
                        onToggle={(findingId, selected) => void toggleFinding(latest.id, findingId, selected)}
                        onReset={() => void resetSelection(latest.id)}
                        onApplied={(findingId, applied) => void setApplied(latest.id, findingId, applied)}
                      />
                    ) : (
                      <Markdown content={latest.body} />
                    );
                  })()}
                  {reviews.filter((entry) => entry.id !== review.id && entry.body !== null).length > 0 ? (
                    <details className="border-t border-border pt-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground">Previous reviews</summary>
                      <div className="mt-2 flex flex-col gap-3">
                        {reviews
                          .filter((entry) => entry.id !== review.id && entry.body !== null)
                          .map((entry) => (
                            <details key={entry.id}>
                              <summary className="cursor-pointer text-xs text-muted-foreground">
                                {shortSha(entry.commitSha)}
                                {entry.sinceCommitSha !== null ? ` (since ${shortSha(entry.sinceCommitSha)})` : ""} ·{" "}
                                {new Date(entry.completedAt ?? entry.createdAt).toLocaleString()}
                              </summary>
                              <div className="mt-2">
                                {entry.report !== null ? <StructuredReview review={entry} onToggle={null} onReset={null} onApplied={null} /> : <Markdown content={entry.body ?? ""} />}
                              </div>
                            </details>
                          ))}
                      </div>
                    </details>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </Group>
  );
}
