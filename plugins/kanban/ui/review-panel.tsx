import { useEffect, useState, type ReactNode } from "react";
import { Markdown } from "@get-bb/plugin-sdk/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import { CHEVRON, OPACITY_TRANSITION, PRESS, STAGGER, enter, speed, stagger, usePopOnChange, POPOVER_MOTION } from "bb-motion";
import type { Ticket } from "../shared/board";
import { locationLabel } from "../shared/finding-location";
import { CONFIDENCE_BAR, NOT_COVERED_REPORT_VERSION, TRIAGED_REPORT_VERSION, VERIFIED_REPORT_VERSION, findingTallies, type Finding, type FindingSeverity, type Review } from "../shared/review";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { shortSha } from "./format";
import { type Rpc, usePushPreference, useReviewUnavailableReason } from "./data";
import { PushToggle, Badge, ThreadStatusDot, COMPACT, Group, KANBAN_MENU, MENU_ITEM_CLASS, menuVimKeys } from "./primitives";
import { type RunAction, toastError } from "./actions";

const SEVERITY_LABEL: Record<FindingSeverity, string> = { critical: "Critical", important: "Important", minor: "Minor" };
const CONFIDENCE_TITLE = "How sure the review's verifier is that it is real (0–100); it does not measure importance";
const MAKE_CARD_TITLE = "Add a Backlog card carrying this finding's title, description, fix and locations";
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
  verified,
  selected = null,
  overridden = false,
  applied = false,
  onToggle = null,
  onApplied = null,
  action = null,
  kind = "introduced",
}: {
  finding: Finding;
  /** Position across all severity groups, so the whole report cascades as one list. */
  index: number;
  /** The report went through the verify pass, so a finding without a confidence is unverified rather than older. */
  verified: boolean;
  selected?: boolean | null;
  overridden?: boolean;
  /** An apply round fixed it (or the user crossed it off); it is folded to its title and kept out of the next round. */
  applied?: boolean;
  onToggle?: ((selected: boolean) => void) | null;
  onApplied?: ((applied: boolean) => void) | null;
  /** A button at the end of the header line. */
  action?: ReactNode;
  /** Pre-existing and deferred ones are drawn dashed; filtered ones dimmed, with the verifier's reason. */
  kind?: "introduced" | "deferred" | "pre-existing" | "filtered";
}) {
  const appliedPop = usePopOnChange(applied);
  return (
    <li
      style={stagger(index)}
      className={cn(
        "rounded-md border border-border bg-card p-2.5",
        enter.rise,
        speed.fast,
        STAGGER,
        OPACITY_TRANSITION,
        (kind === "pre-existing" || kind === "deferred") && "border-dashed",
        (selected === false || applied || kind === "filtered") && "opacity-60",
      )}
    >
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
        {finding.confidence !== null ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title={CONFIDENCE_TITLE}>
            confidence {finding.confidence}
          </span>
        ) : verified ? (
          <span className="shrink-0 text-xs text-muted-foreground" title="The verifier gave no verdict on this one">
            unverified
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
            title={applied ? "Reopen: show it in the diff again and let its checkbox decide whether the next apply round gets it" : "Mark as applied: cross it off and hide it from the diff"}
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
        {action}
      </div>
      {kind === "filtered" && finding.verification !== null && finding.verification !== "" ? <p className="mt-1 text-xs text-muted-foreground">Verifier: {finding.verification}</p> : null}
      {finding.triage !== null && finding.triage.decision !== "apply" && finding.triage.reason !== "" ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Triage: {finding.triage.decision === "defer" ? "deferred" : "dropped"} — {finding.triage.reason}
        </p>
      ) : null}
      {applied ? null : <FindingDetails finding={finding} />}
    </li>
  );
}

function FindingDetails({ finding }: { finding: Finding }) {
  const instances = finding.locations.length;
  return (
    <>
      {finding.class !== null && finding.class !== "" ? (
        <p className="mt-1 text-xs text-muted-foreground">
          <span title="Bug class: the kind of mistake, so one fix covers every instance">{finding.class}</span>
          {instances > 1 ? <span className="tabular-nums"> · {instances} instances</span> : null}
        </p>
      ) : instances > 1 ? (
        <p className="mt-1 text-xs tabular-nums text-muted-foreground">{instances} instances</p>
      ) : null}
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

/** Make a card, or open the one made; disabled while the request runs so two presses can't race. */
function CardAction({ card, onMakeCard, onOpenCard }: { card: string | null; onMakeCard: (() => Promise<void>) | null; onOpenCard: (ticketId: string) => void }) {
  const [making, setMaking] = useState(false);
  if (card !== null) {
    return (
      <Button type="button" variant="ghost" size="sm" className="-my-0.5 h-6 px-2 text-xs" onClick={() => onOpenCard(card)}>
        <Icon name="ArrowUpRight" className="size-3.5" />
        Open card
      </Button>
    );
  }
  if (onMakeCard === null) return null;
  return (
    <span title={MAKE_CARD_TITLE}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-my-0.5 h-6 px-2 text-xs"
        disabled={making}
        onClick={() => {
          setMaking(true);
          void onMakeCard().finally(() => setMaking(false));
        }}
      >
        <Icon name="Plus" className="size-3.5" />
        Make a card
      </Button>
    </span>
  );
}

/** Findings kept for a look, folded under their count until asked for. */
function FoldedFindings({ label, count, title, children }: { label: string; count: number; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label={`${label[0]!.toUpperCase()}${label.slice(1)} findings`}>
      <button
        type="button"
        aria-expanded={open}
        data-bbm-open={open}
        className="flex items-center gap-1 rounded text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        title={title}
        onClick={() => setOpen(!open)}
      >
        <Icon name="ChevronRight" className={cn("size-3.5", CHEVRON)} />
        <span className="tabular-nums">{count}</span> {label}
      </button>
      {open ? <ul className="mt-1.5 flex flex-col gap-2">{children}</ul> : null}
    </section>
  );
}

function StructuredReview({
  review,
  onToggle,
  onReset,
  onApplied,
  onMakeCard,
  onOpenCard,
}: {
  review: Review;
  /** Null makes the view read-only (old reviews). */
  onToggle: ((findingId: string, selected: boolean) => void) | null;
  onReset: (() => void) | null;
  onApplied: ((findingId: string, applied: boolean) => void) | null;
  /** Resolves to the card made from the finding, new or made before. */
  onMakeCard: ((findingId: string) => Promise<string | null>) | null;
  onOpenCard: (ticketId: string) => void;
}) {
  const report = review.report!;
  const verified = report.version >= VERIFIED_REPORT_VERSION;
  const tallies = findingTallies(report, review.selection, review.appliedFindingIds);
  const { introduced, deferred, dropped, preExisting } = tallies;
  const [cards, setCards] = useState<Record<string, string>>({});
  const triagedOut = new Set([...deferred, ...dropped]);
  const grouped = (["critical", "important", "minor"] as const)
    .map((severity) => ({ severity, findings: introduced.filter((finding) => finding.severity === severity && !triagedOut.has(finding)) }))
    .filter((group) => group.findings.length > 0);
  const listed = grouped.reduce((sum, group) => sum + group.findings.length, 0);
  const applied = new Set(review.appliedFindingIds);
  const overriddenCount = Object.keys(review.selectionOverrides).length;
  const suggested = report.version >= TRIAGED_REPORT_VERSION ? "Suggested: the findings the review's triage applies" : "Suggested: critical, or importance ≥ 3 and scope ≥ 3";
  const ownCard = (finding: Finding, index: number, kind: "introduced" | "deferred" = "introduced", action: ReactNode = null) => (
    <FindingCard
      key={finding.id}
      finding={finding}
      index={index}
      verified={verified}
      kind={kind}
      selected={review.selection[finding.id] ?? null}
      overridden={finding.id in review.selectionOverrides}
      applied={applied.has(finding.id)}
      onToggle={onToggle === null ? null : (selected) => onToggle(finding.id, selected)}
      onApplied={onApplied === null ? null : (isApplied) => onApplied(finding.id, isApplied)}
      action={action}
    />
  );
  const cardAction = (finding: Finding) => (
    <CardAction
      card={cards[finding.id] ?? null}
      onMakeCard={
        onMakeCard === null
          ? null
          : () =>
              onMakeCard(finding.id).then((ticketId) => {
                if (ticketId !== null) setCards((current) => ({ ...current, [finding.id]: ticketId }));
              })
      }
      onOpenCard={onOpenCard}
    />
  );
  return (
    <div className="flex flex-col gap-3">
      {report.summary !== "" ? <Markdown content={report.summary} className="text-sm" /> : null}
      {introduced.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span title={overriddenCount > 0 ? `${overriddenCount} changed by you` : suggested}>
            <span className="font-medium text-foreground tabular-nums">{tallies.selected}</span> of {tallies.open} open selected
            {tallies.applied > 0 ? <> · <span className="tabular-nums">{tallies.applied}</span> applied</> : null}
          </span>
          {onReset !== null && overriddenCount > 0 ? (
            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onReset}>
              Reset to suggested
            </Button>
          ) : null}
        </div>
      ) : null}
      {grouped.length === 0 ? (
        <p className={cn("text-sm text-muted-foreground", enter.fade)}>
          {introduced.length > 0 ? "Triage applies none of this change's findings." : preExisting.length > 0 ? "No findings in this change." : "No findings."}
        </p>
      ) : null}
      {grouped.map(({ severity, findings }, groupIndex) => (
        <section key={severity} aria-label={SEVERITY_LABEL[severity]}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {SEVERITY_LABEL[severity]} <span className="font-normal tabular-nums">{findings.length}</span>
          </h3>
          <ul className="flex flex-col gap-2">
            {findings.map((finding, index) => ownCard(finding, grouped.slice(0, groupIndex).reduce((sum, group) => sum + group.findings.length, 0) + index))}
          </ul>
        </section>
      ))}
      {deferred.length > 0 ? (
        <section aria-label="Deferred">
          <h3 className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Deferred <span className="font-normal tabular-nums">{deferred.length}</span>
          </h3>
          <p className="mb-1.5 text-xs text-muted-foreground">Real, but triage judged the fix separate work: make it a card, or tick it to fix it in this change.</p>
          <ul className="flex flex-col gap-2">{deferred.map((finding, index) => ownCard(finding, listed + index, "deferred", cardAction(finding)))}</ul>
        </section>
      ) : null}
      {dropped.length > 0 ? (
        <FoldedFindings label="dropped" count={dropped.length} title="Findings triage judged not worth their churn, or against the project's conventions; tick one to fix it anyway">
          {dropped.map((finding, index) => ownCard(finding, index))}
        </FoldedFindings>
      ) : null}
      {preExisting.length > 0 ? (
        <section aria-label="Pre-existing">
          <h3 className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pre-existing <span className="font-normal tabular-nums">{preExisting.length}</span>
          </h3>
          <p className="mb-1.5 text-xs text-muted-foreground">Already in the code before this change, so never part of an apply round.</p>
          <ul className="flex flex-col gap-2">
            {preExisting.map((finding, index) => (
              <FindingCard key={finding.id} finding={finding} index={introduced.length + index} verified={verified} kind="pre-existing" action={cardAction(finding)} />
            ))}
          </ul>
        </section>
      ) : null}
      {report.filtered.length > 0 ? (
        <FoldedFindings label="filtered" count={report.filtered.length} title={`Findings the verifier scored below ${CONFIDENCE_BAR} for being real; never selected or applied`}>
          {report.filtered.map((finding, index) => (
            <FindingCard key={finding.id} finding={finding} index={index} verified={verified} kind="filtered" />
          ))}
        </FoldedFindings>
      ) : null}
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
      {report.version >= NOT_COVERED_REPORT_VERSION ? (
        <section aria-label="Not covered">
          <h3 className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Not covered <span className="font-normal tabular-nums">{report.notCovered.length}</span>
          </h3>
          {report.notCovered.length === 0 ? (
            <p className="text-xs text-muted-foreground">The review found nothing the checks miss.</p>
          ) : (
            <>
              <p className="mb-1 text-xs text-muted-foreground">Neither the checks nor the review could confirm these; look at them yourself.</p>
              <ul className="flex flex-col gap-1 text-sm">
                {report.notCovered.map((entry) => (
                  <li key={entry} className="flex gap-1.5">
                    <Icon name="Circle" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <Markdown content={entry} className="min-w-0 flex-1" />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : null}
      {report.skippedFiles.length > 0 ? (
        <p className="text-xs text-muted-foreground">Skipped generated files: {report.skippedFiles.join(", ")}</p>
      ) : null}
    </div>
  );
}

function applyStatusLabel(apply: NonNullable<Review["apply"]>, local: boolean): string {
  if (apply.completedAt === null) return local ? "Card thread applying" : "Apply thread running";
  if (local) return `Committed ${shortSha(apply.pushedCommit)}`;
  return apply.push ? `Pushed ${shortSha(apply.pushedCommit)}` : `Committed ${shortSha(apply.pushedCommit)}, not pushed`;
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
  onOpenTicket,
}: {
  ticket: Ticket;
  threads: ReadonlyMap<string, PluginSidebarThread>;
  rpc: Rpc;
  pending: boolean;
  canReview: boolean;
  run: RunAction;
  onOpenThread: (threadId: string) => void;
  onOpenTicket: (ticketId: string) => void;
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
  const makeCard = (reviewId: string, findingId: string) =>
    rpc.call("review_make_card", { reviewId, findingId }).then(
      ({ ticket: card, created }) => {
        if (created) toast.success(`Added “${card.title}” to the board`);
        else toast(`Already on the board as “${card.title}”`);
        return card.id;
      },
      (cause: unknown) => {
        toastError(cause);
        return null;
      },
    );
  const startReview = (mode: "full" | "incremental") =>
    void run(() => rpc.call("ticket_review_pr", { id: ticket.id, projectId: null, mode }), "Review started");
  const localReason = useReviewUnavailableReason(ticket);
  const unavailable = canReview ? localReason : "Start the card's thread in a project first; reviews run there";
  const canStart = unavailable === null && !pending && review?.status !== "running";
  // The next review is of the card's kind, and only continues from a review of the same kind.
  const reviewsLocally = ticket.pr === null;
  const canIncremental = review?.status === "completed" && review.commitSha !== null && review.subjectKind === (reviewsLocally ? "local" : "pr");
  const unavailableNote = unavailable === null ? null : <span className="text-xs text-muted-foreground">{unavailable}</span>;
  const appliesLocally = review?.subjectKind === "local";

  const menu = review === null ? null : (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Review options">
          <Icon name="MoreHorizontal" className="size-4" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content {...usePortalScopeProps()} align="end" sideOffset={4} className={cn("z-50 min-w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md", POPOVER_MOTION, KANBAN_MENU)} onKeyDown={menuVimKeys}>
          {review.apply !== null ? (
            <>
              <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={() => onOpenThread(review.apply!.threadId)}>
                <Icon name="kanban-wrench" className="size-4 text-muted-foreground" />
                {appliesLocally ? "Open the card's thread" : "Open apply thread"}
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
            </>
          ) : null}
          {unavailable !== null && review.status !== "running" ? <DropdownMenu.Label className="max-w-64 px-2 py-1 text-xs text-muted-foreground">{unavailable}</DropdownMenu.Label> : null}
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
          <span title={unavailable ?? (reviewsLocally ? "Runs the code-review skill on the card thread's commits, in a worktree of their own" : "Runs the code-review skill on the PR in its own worktree")}>
            <Button type="button" variant="secondary" className={COMPACT} disabled={!canStart} onClick={() => startReview("full")}>
              <Icon name="kanban-search-check" className="size-3.5" />
              {reviewsLocally ? "Review the commits" : "Review this PR"}
            </Button>
          </span>
          {unavailableNote}
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
          {unavailableNote}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span title={selectedCount === 0 ? "Tick at least one open finding to apply" : appliesLocally ? "Sends the selected open findings to the card's thread to fix and commit" : "Applies the selected findings that are still open"}>
              <Button
                type="button"
                variant="secondary"
                className={COMPACT}
                disabled={pending || applying || !review.hasBody || selectedCount === 0}
                onClick={() =>
                  void run(() => rpc.call("review_apply", { ticketId: ticket.id, reviewId: review.id, push: !appliesLocally && push }), appliesLocally ? "Sent to the card's thread" : "Apply thread started")
                }
              >
                <Icon name="kanban-wrench" className="size-3.5" />
                {applying ? "Applying…" : `Apply ${selectedCount ?? ""}${selectedCount === null ? "review" : selectedCount === 1 ? " finding" : " findings"}`}
              </Button>
            </span>
            {appliesLocally ? null : <PushToggle push={push} onChange={setPush} disabled={pending || applying} />}
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
                {applyStatusLabel(review.apply, appliesLocally)}
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
                        onMakeCard={(findingId) => makeCard(latest.id, findingId)}
                        onOpenCard={onOpenTicket}
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
                                {entry.report !== null ? <StructuredReview review={entry} onToggle={null} onReset={null} onApplied={null} onMakeCard={null} onOpenCard={onOpenTicket} /> : <Markdown content={entry.body ?? ""} />}
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
