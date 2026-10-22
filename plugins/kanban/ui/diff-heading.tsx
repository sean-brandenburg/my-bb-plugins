import { useCallback, useEffect, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { POPOVER_MOTION } from "bb-motion";
import type { rpcContract } from "../contract";
import type { Ticket } from "../shared/board";
import { BOARD_CHANGED } from "../shared/events";
import { REVIEW_DEPTH_LABEL } from "../shared/review";
import type { CodeReviewThread } from "../shared/tour";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { relativeTime, shortSha } from "./format";
import { useOpenThread, useNow, useReviewUnavailableReason } from "./data";
import { Badge, COMPACT, ExternalLink, KANBAN_MENU, MENU_ITEM_CLASS, menuVimKeys } from "./primitives";
import { toastError } from "./actions";

const PR_LINK = "inline-flex shrink-0 items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * The changes page's heading: the card's title and PR on the left, its review threads on the
 * right. The host title bar only has room on its right for short controls, so the page names
 * itself here.
 */
export function DiffPageHeading({ subjectId, ticket }: { subjectId: string; ticket: Ticket | null }) {
  return (
    <div data-kanban-diff-heading="" className="flex items-center gap-3 border-b border-border px-3 py-1.5">
      <h1 className="min-w-0 truncate text-sm font-semibold" title={ticket?.title}>
        {ticket?.title ?? "Changes"}
      </h1>
      {ticket !== null && ticket.pr !== null ? (
        <ExternalLink href={ticket.pr.url} title={`Open ${ticket.pr.repo}#${ticket.pr.number} on GitHub`} className={PR_LINK}>
          <Icon name="GitPullRequest" className="size-3.5" />
          {ticket.pr.repo.split("/")[1]}#{ticket.pr.number}
        </ExternalLink>
      ) : ticket !== null ? (
        <span className="shrink-0 text-xs text-muted-foreground">{ticket.id}</span>
      ) : null}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {ticket !== null ? <ReviewThreadButtons ticket={ticket} /> : null}
        <CodeReviewThreadsMenu subjectId={subjectId} />
      </span>
    </div>
  );
}

const CODE_REVIEW_THREAD_ICON: Record<CodeReviewThread["kind"], string> = {
  review: "kanban-search-check",
  apply: "kanban-wrench",
  "apply-comments": "kanban-wrench",
  narrative: "MessageSquare",
  explain: "MessageSquare",
};

/** The latest review and its apply round, one click from the changes page; older threads stay in the Threads menu. */
export function ReviewThreadButtons({ ticket }: { ticket: Ticket }) {
  const rpc = useRpc<typeof rpcContract>();
  const openThread = useOpenThread();
  const [starting, setStarting] = useState(false);
  const review = ticket.latestReview;
  const unavailable = useReviewUnavailableReason(ticket, review === null);
  const startReview = async () => {
    setStarting(true);
    try {
      const updated = await rpc.call("ticket_review_pr", { id: ticket.id, projectId: null });
      if (updated.reviewThreadId !== null) openThread(updated.reviewThreadId);
    } catch (cause) {
      toastError(cause);
    } finally {
      setStarting(false);
    }
  };
  if (review === null) {
    return (
      <span title={unavailable ?? `${ticket.pr !== null ? "Review the PR" : "Review the card thread's commits"} at Standard depth; the card panel's Code review picks another depth`}>
        <Button type="button" variant="secondary" className={COMPACT} disabled={starting || unavailable !== null} onClick={() => void startReview()}>
          <Icon name="kanban-search-check" className="size-3.5" />
          {starting ? "Starting…" : "Review"}
        </Button>
      </span>
    );
  }
  const counts = review.counts;
  const total = counts === null ? null : counts.critical + counts.important + counts.minor;
  const apply = review.apply;
  return (
    <>
      <span title={`${review.depth === null ? "" : `${REVIEW_DEPTH_LABEL[review.depth]} review. `}${review.status === "running" ? "Open the running review thread" : "Open the review thread to read the findings or keep iterating"}`}>
        <Button type="button" variant="secondary" className={COMPACT} onClick={() => openThread(review.threadId)}>
          <Icon name="kanban-search-check" className={cn("size-3.5", review.status === "running" && "animate-pulse")} />
          {review.status === "running" ? "Reviewing…" : review.sinceCommitSha === null ? "Review" : "Re-review"}
          {review.status === "failed" ? (
            <Badge tone="danger">failed</Badge>
          ) : total !== null && counts !== null ? (
            <Badge tone={counts.critical > 0 ? "danger" : counts.important > 0 ? "warning" : total === 0 ? "success" : "neutral"}>{total}</Badge>
          ) : null}
        </Button>
      </span>
      {apply !== null ? (
        <span title={apply.completedAt === null ? "Open the thread applying the review" : `Fixes ${apply.push ? "pushed" : "committed"} as ${shortSha(apply.pushedCommit)}`}>
          <Button type="button" variant="ghost" className={COMPACT} onClick={() => openThread(apply.threadId)}>
            <Icon name="kanban-wrench" className={cn("size-3.5", apply.completedAt === null && "animate-pulse")} />
            {apply.completedAt === null ? "Applying…" : "Fixes"}
          </Button>
        </span>
      ) : null}
    </>
  );
}

/** Code review threads run hidden from the sidebar and the project, so this menu is how the changes page reaches them. */
export function CodeReviewThreadsMenu({ subjectId }: { subjectId: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const openThread = useOpenThread();
  const now = useNow();
  const [threads, setThreads] = useState<CodeReviewThread[]>([]);
  const load = useCallback(() => {
    rpc.call("code_review_threads", { ticketId: subjectId }).then((result) => setThreads(result.threads), () => setThreads([]));
  }, [rpc, subjectId]);
  useEffect(load, [load]);
  useRealtime(BOARD_CHANGED, load);
  if (threads.length === 0) return null;
  const running = threads.filter((thread) => thread.status === "running").length;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button type="button" variant="ghost" className={COMPACT} aria-label="Code review threads">
          <Icon name="MessageSquare" className={cn("size-3.5", running > 0 && "animate-pulse")} />
          Threads
          <Badge tone={running > 0 ? "accent" : "neutral"}>{threads.length}</Badge>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content {...usePortalScopeProps()} align="end" sideOffset={4} className={cn("z-50 max-h-96 min-w-64 max-w-96 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md", POPOVER_MOTION, KANBAN_MENU)} onKeyDown={menuVimKeys}>
          {threads.map((thread) => (
            <DropdownMenu.Item key={`${thread.kind}:${thread.threadId}`} className={MENU_ITEM_CLASS} onSelect={() => openThread(thread.threadId)}>
              <Icon name={CODE_REVIEW_THREAD_ICON[thread.kind]} className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{thread.label}</span>
              {thread.status === "running" ? <Badge tone="accent">running</Badge> : thread.status === "failed" ? <Badge tone="danger">failed</Badge> : null}
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{relativeTime(thread.startedAt, now)}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
