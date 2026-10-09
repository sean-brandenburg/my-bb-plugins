import type { DragEvent } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { LIFT, OPACITY_TRANSITION, POP, PRESS, STAGGER, enter, stagger, type Arrival, useEntrance, usePopOnChange } from "bb-motion";
import type { Ticket } from "../shared/board";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { dueStatus, shortSha, threadStatusText } from "./format";
import { ExternalLink, ThreadStatusDot } from "./primitives";
import { TagBadges } from "./tags";

export function CardView({
  ticket,
  arrival,
  staggerIndex,
  settling,
  onSettled,
  thread,
  hiddenTags,
  today,
  isDone,
  isDragging,
  onOpen,
  onOpenThread,
  onOpenReview,
  onReview,
  onOpenDiff,
  onDragStart,
  onDragEnd,
}: {
  ticket: Ticket;
  arrival: Arrival;
  staggerIndex: number;
  /** Just dropped: pops once, then reports back through `onSettled`. */
  settling: boolean;
  onSettled: () => void;
  thread: PluginSidebarThread | null | undefined;
  /** Tags applied by the card's source; every card from that source carries them, so they are noise here. */
  hiddenTags: ReadonlySet<string>;
  /** The viewer's local day, `YYYY-MM-DD`, that due dates are measured against. */
  today: string;
  isDone: boolean;
  isDragging: boolean;
  onOpen: () => void;
  onOpenThread: () => void;
  onOpenReview: () => void;
  onReview: () => void;
  onOpenDiff: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const review = ticket.latestReview;
  const ownTags = ticket.tags.filter((tag) => !hiddenTags.has(tag));
  const iconButton = cn("flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-state-hover hover:text-foreground", PRESS);
  const entrance = useEntrance(arrival === "intro" ? cn(enter.rise, STAGGER) : arrival === "new" ? enter.pop : undefined);
  // Only states that need the eye get words; a quiet idle thread is just a dot.
  const status = ticket.threadId === null ? null : threadStatusText(thread);
  const loud = status === "working" || status === "needs you" || status === "error" || status === "provisioning";
  const shownTags = ownTags.slice(0, CARD_MAX_TAGS);
  const stopping = (action: () => void) => (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    action();
  };
  return (
    <div
      data-ticket-id={ticket.id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        entrance.onAnimationEnd(event);
        if (settling) onSettled();
      }}
      style={stagger(staggerIndex)}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group relative flex cursor-grab flex-col gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-left text-sm shadow-sm hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing",
        // The drag source dims instantly and stays put; lift and press would fight the drag image.
        isDragging ? "opacity-40" : cn(LIFT, PRESS),
        settling ? POP : entrance.className,
      )}
    >
      <span className="line-clamp-2 break-words font-medium leading-5">{ticket.title}</span>
      {shownTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          <TagBadges tags={shownTags} />
          {ownTags.length > shownTags.length ? (
            <span className="text-[11px] text-muted-foreground" title={ownTags.slice(CARD_MAX_TAGS).join(", ")}>
              +{ownTags.length - shownTags.length}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="relative flex h-5 items-center gap-2 text-[11px] text-muted-foreground">
        {ticket.threadId !== null ? (
          <span className="inline-flex shrink-0 items-center gap-1.5" title={`Thread ${status ?? ""}`}>
            <ThreadStatusDot thread={thread} />
            {loud ? <span className={cn(status === "error" && "text-destructive", status === "needs you" && "text-amber-700 dark:text-amber-300")}>{status}</span> : null}
          </span>
        ) : (
          <span className="size-2 shrink-0 rounded-full border border-border" title="No thread yet" />
        )}
        <CardIdentity ticket={ticket} />
        <span className="ml-auto flex shrink-0 items-center gap-2.5">
          {ticket.dueDate !== null ? <CardDueDate dueDate={ticket.dueDate} today={today} isDone={isDone} /> : null}
          {ticket.children.total > 0 ? (
            <CardCounter icon="ListTodo" count={`${ticket.children.done}/${ticket.children.total}`} tone={ticket.children.done === ticket.children.total ? "good" : "quiet"} title={`${ticket.children.done} of ${ticket.children.total} subtasks done`} />
          ) : null}
          <CardReviewIndicator ticket={ticket} />
          {ticket.comments !== null && ticket.comments.open > 0 ? (
            <CardCounter icon="MessageSquare" count={ticket.comments.open} tone="attention" title={`${ticket.comments.open} PR comment${ticket.comments.open === 1 ? "" : "s"} not yet addressed`} />
          ) : null}
          {ticket.pendingDiffComments > 0 ? (
            <CardCounter icon="kanban-diff" count={ticket.pendingDiffComments} tone="attention" title={`${ticket.pendingDiffComments} diff comment${ticket.pendingDiffComments === 1 ? "" : "s"} not sent yet`} />
          ) : null}
        </span>
        {/* Hover actions sit over the counters instead of reserving room for themselves. */}
        <span className={`pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 bg-card pl-3 opacity-0 ${OPACITY_TRANSITION} [mask-image:linear-gradient(to_right,transparent,black_12px)] focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100`}>
          {ticket.pr !== null ? (
            <button
              type="button"
              aria-label={review === null ? "Review PR" : "Open PR review"}
              title={review === null ? "Run the code-review skill on this PR" : "Open the PR review"}
              className={iconButton}
              onClick={stopping(review === null ? onReview : onOpenReview)}
            >
              <Icon name="kanban-search-check" className="size-3.5" />
            </button>
          ) : null}
          {ticket.pr !== null || ticket.threadId !== null ? (
            <button type="button" aria-label="View changes" title="View changes" className={iconButton} onClick={stopping(onOpenDiff)}>
              <Icon name="kanban-diff" className="size-3.5" />
            </button>
          ) : null}
          {ticket.threadId !== null ? (
            <button type="button" aria-label="Open thread" title="Open thread" className={iconButton} onClick={stopping(onOpenThread)}>
              <Icon name="MessageSquare" className="size-3.5" />
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}

const CARD_MAX_TAGS = 3;

const COUNTER_TONE: Record<"quiet" | "attention" | "danger" | "good" | "busy", string> = {
  quiet: "",
  attention: "text-amber-700 dark:text-amber-300",
  danger: "text-destructive",
  good: "text-emerald-700 dark:text-emerald-300",
  busy: "text-primary animate-pulse",
};

/** A footer stat: an icon and a number, coloured only when it asks for attention. */
function CardCounter({ icon, count, tone, title }: { icon: string; count?: number | string; tone: keyof typeof COUNTER_TONE; title: string }) {
  const pop = usePopOnChange(`${icon}|${tone}|${count ?? ""}`);
  return (
    <span key={pop.key} onAnimationEnd={pop.onAnimationEnd} className={cn("inline-flex items-center gap-1 tabular-nums", COUNTER_TONE[tone], pop.className)} title={title}>
      <Icon name={icon} className="size-3" />
      {count !== undefined ? count : null}
    </span>
  );
}

function CardDueDate({ dueDate, today, isDone }: { dueDate: string; today: string; isDone: boolean }) {
  const due = dueStatus(dueDate, today);
  // A finished card is not late, so only open cards are coloured.
  const tone = isDone ? "quiet" : due.tone === "overdue" ? "danger" : due.tone === "soon" ? "attention" : "quiet";
  return <CardCounter icon="kanban-calendar" count={due.label} tone={tone} title={due.title} />;
}

/** Where the card comes from, as quiet text: `widgets #7 · draft`, `PROJ-12 · In Progress`, or `↳ subtask`. */
function CardIdentity({ ticket }: { ticket: Ticket }) {
  if (ticket.pr !== null) {
    const { pr } = ticket;
    const stateClass = pr.state === "merged" ? "text-violet-700 dark:text-violet-300" : pr.state === "closed" ? "text-destructive" : "";
    return (
      <ExternalLink href={pr.url} title={`Open ${pr.repo}#${pr.number} on GitHub`} className="min-w-0 truncate hover:text-foreground hover:underline">
        {pr.repo.split("/")[1] ?? pr.repo} #{pr.number}
        {pr.state !== "open" ? <span className={stateClass}> · {pr.state}</span> : null}
      </ExternalLink>
    );
  }
  if (ticket.jira !== null) {
    const { jira } = ticket;
    return (
      <ExternalLink href={jira.url} title={`Open ${jira.key} in Jira${jira.priority !== null ? ` · ${jira.priority} priority` : ""}`} className="min-w-0 truncate hover:text-foreground hover:underline">
        {jira.key}
        {jira.status !== "" ? ` · ${jira.status}` : ""}
      </ExternalLink>
    );
  }
  if (ticket.parentId !== null) return <span className="min-w-0 truncate">↳ subtask</span>;
  return null;
}

/** The latest review collapsed to one icon: pulsing while it runs, the finding count coloured by the worst severity once done. */
function CardReviewIndicator({ ticket }: { ticket: Ticket }) {
  const review = ticket.latestReview;
  if (review === null) return null;
  if (review.status === "running") return <CardCounter icon="kanban-search-check" tone="busy" title="Review running" />;
  if (review.status === "failed") return <CardCounter icon="kanban-search-check" tone="danger" title="Review failed" />;
  if (review.apply !== null && review.apply.completedAt === null) return <CardCounter icon="kanban-wrench" tone="busy" title="Applying review fixes" />;
  if (review.apply !== null) {
    return <CardCounter icon="Check" tone="good" title={`Review fixes ${review.apply.push ? "pushed" : "committed"} as ${shortSha(review.apply.pushedCommit)}`} />;
  }
  const counts = review.counts;
  if (counts === null) return <CardCounter icon="kanban-search-check" tone="quiet" title={`Reviewed at ${shortSha(review.commitSha)}`} />;
  const total = counts.critical + counts.important + counts.minor;
  if (total === 0) return <CardCounter icon="kanban-search-check" tone="good" title="Review found nothing" />;
  return (
    <CardCounter
      icon="kanban-search-check"
      count={total}
      tone={counts.critical > 0 ? "danger" : counts.important > 0 ? "attention" : "quiet"}
      title={`${counts.critical} critical, ${counts.important} important, ${counts.minor} minor · ${review.selectedCount ?? 0} selected to apply`}
    />
  );
}
