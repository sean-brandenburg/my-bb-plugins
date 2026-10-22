import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { POPOVER_MOTION } from "bb-motion";
import type { rpcContract } from "../contract";
import type { Ticket } from "../shared/board";
import { BOARD_CHANGED } from "../shared/events";
import type { CodeReviewThread } from "../shared/tour";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { relativeTime } from "./format";
import { useOpenThread, useNow, useReviewUnavailableReason } from "./data";
import { Badge, COMPACT, ExternalLink, KANBAN_MENU, MENU_ITEM_CLASS, menuVimKeys } from "./primitives";
import { toastError } from "./actions";

const PR_LINK = "inline-flex shrink-0 items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * The changes page's heading: the card's title and PR on the left; on the right the send controls for the comments
 * left on the diff, a Review button until the card has a review, and the Threads menu that reaches every code review
 * thread. The host title bar only has room on its right for short controls, so the page names itself here.
 */
export function DiffPageHeading({ subjectId, ticket, actions }: { subjectId: string; ticket: Ticket | null; actions?: ReactNode }) {
  return (
    <div data-kanban-diff-heading="" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-3 py-1.5">
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
      <span className="ml-auto flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        {actions}
        <span className="flex shrink-0 items-center gap-1.5">
          {ticket !== null && ticket.latestReview === null ? <StartReviewButton ticket={ticket} /> : null}
          <CodeReviewThreadsMenu subjectId={subjectId} latestReview={ticket?.latestReview ?? null} />
        </span>
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

/** Starts the card's first review at Standard depth; once one exists its thread and apply round are in the Threads menu. */
function StartReviewButton({ ticket }: { ticket: Ticket }) {
  const rpc = useRpc<typeof rpcContract>();
  const openThread = useOpenThread();
  const [starting, setStarting] = useState(false);
  const unavailable = useReviewUnavailableReason(ticket, true);
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
  return (
    <span title={unavailable ?? `${ticket.pr !== null ? "Review the PR" : "Review the card thread's commits"} at Standard depth; the card panel's Code review picks another depth`}>
      <Button type="button" variant="secondary" className={COMPACT} disabled={starting || unavailable !== null} onClick={() => void startReview()}>
        <Icon name="kanban-search-check" className="size-3.5" />
        {starting ? "Starting…" : "Review"}
      </Button>
    </span>
  );
}

/** Code review threads run hidden from the sidebar and the project, so this menu is how the changes page reaches them. */
export function CodeReviewThreadsMenu({ subjectId, latestReview }: { subjectId: string; latestReview: Ticket["latestReview"] }) {
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
  const failed = latestReview?.status === "failed" || threads.some((thread) => thread.status === "failed");
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <span title={running > 0 ? `${running} thread${running === 1 ? "" : "s"} running; open one to watch` : "The review, apply, narrative and explanation threads of this card"}>
          <Button type="button" variant="ghost" className={COMPACT} aria-label="Code review threads">
            <Icon name="MessageSquare" className={cn("size-3.5", running > 0 && "animate-pulse")} />
            Threads
            <Badge tone={running > 0 ? "accent" : failed ? "danger" : "neutral"}>{threads.length}</Badge>
          </Button>
        </span>
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
