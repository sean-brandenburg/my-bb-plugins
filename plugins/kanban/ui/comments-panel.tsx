import { useEffect, useState } from "react";
import { Markdown } from "@get-bb/plugin-sdk/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { PRESS, STAGGER, enter, exit, speed, stagger, type Arrival, useArrivals, useEntrance, usePopOnChange, usePresenceList } from "bb-motion";
import type { Ticket } from "../shared/board";
import type { CommentApply, PrComment } from "../shared/comments";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { relativeTime, shortSha } from "./format";
import { type Rpc, usePushPreference, useNow } from "./data";
import { ExternalLink, PushToggle, Badge, ThreadStatusDot, COMPACT, Group } from "./primitives";
import { type RunAction, toastError } from "./actions";

function commentWhere(comment: PrComment): string {
  if (comment.kind === "review-comment") return `${comment.path ?? "?"}${comment.line === null ? "" : `:${comment.line}`}`;
  if (comment.kind === "review") return `review · ${(comment.reviewState ?? "COMMENTED").toLowerCase().replace("_", " ")}`;
  return "conversation";
}

function CommentRow({
  comment,
  replies,
  now,
  index,
  arrival,
  exiting,
  onExited,
  onSelect,
  onAddressed,
}: {
  comment: PrComment;
  replies: PrComment[];
  now: number;
  index: number;
  arrival: Arrival;
  exiting: boolean;
  onExited: () => void;
  onSelect: (comment: PrComment, selected: boolean) => void;
  onAddressed: (comment: PrComment, addressed: boolean) => void;
}) {
  const addressed = comment.addressedAt !== null;
  const entrance = useEntrance(arrival === "intro" ? cn(enter.rise, speed.fast, STAGGER) : arrival === "new" ? enter.rise : undefined);
  const addressedPop = usePopOnChange(addressed);
  return (
    <li
      style={stagger(index)}
      onAnimationEnd={(event) => {
        if (exiting && event.target === event.currentTarget) onExited();
        else entrance.onAnimationEnd(event);
      }}
      className={cn("rounded-md border border-border bg-card p-2.5", (addressed || comment.mine) && "opacity-70", exiting ? exit.sink : entrance.className)}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={comment.selected}
          disabled={addressed}
          onCheckedChange={(checked) => onSelect(comment, checked === true)}
          aria-label={`${comment.selected ? "Exclude" : "Include"} this comment in the apply round`}
          className="mt-0.5"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{comment.author}</span>
            {comment.mine ? <Badge>you</Badge> : null}
            <code className="truncate">{commentWhere(comment)}</code>
            <span>{relativeTime(Date.parse(comment.createdAt), now)}</span>
            {addressed ? <Badge tone="success">addressed</Badge> : null}
            {comment.selectionOverride !== null ? <Badge title="You changed this from the suggested selection">manual</Badge> : null}
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                aria-label={addressed ? "Mark as not addressed" : "Mark as addressed"}
                title={addressed ? "Mark as not addressed" : "Mark as addressed"}
                className={cn(
                  "flex size-6 items-center justify-center rounded hover:bg-state-hover",
                  PRESS,
                  addressed ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onAddressed(comment, !addressed)}
              >
                {/* The pop lives on a wrapper so remounting it never takes focus from the button. */}
                <span key={addressedPop.key} onAnimationEnd={addressedPop.onAnimationEnd} className={cn("flex", addressedPop.className)}>
                  <Icon name="CircleCheck" className="size-3.5" />
                </span>
              </button>
              <ExternalLink href={comment.url} title="Open on GitHub" className={cn("flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-state-hover hover:text-foreground", PRESS)}>
                <Icon name="ExternalLink" className="size-3.5" />
              </ExternalLink>
            </span>
          </div>
          {comment.body.trim() !== "" ? <Markdown content={comment.body} className="text-sm" /> : <p className="text-xs italic text-muted-foreground">(no text)</p>}
          {replies.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-2 border-l-2 border-border pl-3">
              {replies.map((reply) => (
                <li key={reply.id} className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={reply.selected}
                      disabled={reply.addressedAt !== null}
                      onCheckedChange={(checked) => onSelect(reply, checked === true)}
                      aria-label={`${reply.selected ? "Exclude" : "Include"} this reply in the apply round`}
                    />
                    <span className="font-medium text-foreground">{reply.author}</span>
                    {reply.mine ? <Badge>you</Badge> : null}
                    <span>{relativeTime(Date.parse(reply.createdAt), now)}</span>
                  </div>
                  <Markdown content={reply.body} className="text-sm" />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function CommentsPanel({
  ticket,
  threads,
  rpc,
  pending,
  canApply,
  run,
  onOpenThread,
}: {
  ticket: Ticket;
  threads: ReadonlyMap<string, PluginSidebarThread>;
  rpc: Rpc;
  pending: boolean;
  canApply: boolean;
  run: RunAction;
  onOpenThread: (threadId: string) => void;
}) {
  const now = useNow();
  const [push, setPush] = usePushPreference();
  const [autoApprove, setAutoApprove] = useState(false);
  const [showAddressed, setShowAddressed] = useState(false);
  const [data, setData] = useState<{ comments: PrComment[]; applies: CommentApply[] } | null>(null);
  const counts = ticket.comments;
  const open = (counts?.total ?? 0) > 0;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    rpc.call("comments_list", { ticketId: ticket.id }).then(
      (result) => {
        if (!cancelled) setData(result);
      },
      toastError,
    );
    return () => {
      cancelled = true;
    };
  }, [open, ticket.id, counts?.total, counts?.open, counts?.selected, rpc]);

  const patch = (updated: PrComment) =>
    setData((current) => (current === null ? current : { ...current, comments: current.comments.map((entry) => (entry.id === updated.id ? updated : entry)) }));
  const select = (comment: PrComment, selected: boolean) =>
    rpc.call("comment_set_selected", { id: comment.id, selected }).then(patch, toastError);
  const address = (comment: PrComment, addressed: boolean) =>
    rpc.call("comment_set_addressed", { id: comment.id, addressed }).then(patch, toastError);

  const running = data?.applies.find((apply) => apply.completedAt === null) ?? null;
  const last = data?.applies[0] ?? null;
  const comments = data?.comments ?? [];
  const topLevel = comments.filter((comment) => comment.inReplyTo === null && (showAddressed || comment.addressedAt === null));
  const repliesOf = (id: string) => comments.filter((comment) => comment.inReplyTo === id);
  const addressedCount = comments.filter((comment) => comment.addressedAt !== null).length;
  const arrival = useArrivals(data === null ? null : topLevel.map((comment) => comment.id));
  const shown = usePresenceList(topLevel, (comment) => comment.id);

  if (counts === null || counts.total === 0) return null;
  return (
    <Group
      title="PR comments"
      summary={
        <>
          {counts.open > 0 ? <Badge tone="warning">{counts.open} open</Badge> : null}
          {counts.open === 0 ? <Badge tone="success">all addressed</Badge> : null}
        </>
      }
      defaultOpen
    >
      <div className="flex flex-wrap items-center gap-2">
        {counts.open > 0 || running !== null ? (
          <>
            <span title={!canApply ? "Start the card's thread in a project first; the apply thread runs there" : counts.selected === 0 ? "Tick at least one comment to apply" : "Applies the selected comments"}>
              <Button
                type="button"
                variant="secondary"
                className={COMPACT}
                disabled={pending || !canApply || counts.selected === 0 || running !== null}
                onClick={() => void run(() => rpc.call("comments_apply", { ticketId: ticket.id, autoApprove, push }), "Apply thread started")}
              >
                <Icon name="kanban-wrench" className="size-3.5" />
                {running !== null ? "Applying…" : `Apply ${counts.selected} comment${counts.selected === 1 ? "" : "s"}`}
              </Button>
            </span>
            <PushToggle push={push} onChange={setPush} disabled={pending || running !== null} />
          </>
        ) : null}
        {last !== null ? (
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onOpenThread(last.threadId)}
          >
            <ThreadStatusDot thread={threads.get(last.threadId)} />
            {last.completedAt === null
              ? "Apply thread running"
              : last.push
                ? `Pushed ${shortSha(last.pushedCommit)}`
                : `Committed ${shortSha(last.pushedCommit)}, not pushed`}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span title="Suggested: everything others wrote that is not yet addressed">{counts.selected} selected</span>
            {addressedCount > 0 ? (
              <label className="ml-auto inline-flex items-center gap-1.5">
                <Checkbox checked={showAddressed} onCheckedChange={(checked) => setShowAddressed(checked === true)} aria-label="Show addressed comments" />
                Show {addressedCount} addressed
              </label>
            ) : null}
            <label className="inline-flex items-center gap-1.5">
              <Checkbox checked={autoApprove} onCheckedChange={(checked) => setAutoApprove(checked === true)} aria-label="Skip triage confirmation when applying" />
              Skip triage
            </label>
          </div>
          {data === null ? (
            <p className={cn("text-sm text-muted-foreground", enter.fade)}>Loading…</p>
          ) : shown.entries.length === 0 ? (
            <p className={cn("text-sm text-muted-foreground", enter.fade)}>Nothing open.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {shown.entries.map(({ key, item: comment, exiting }, index) => (
                <CommentRow
                  key={key}
                  comment={comment}
                  replies={repliesOf(comment.id)}
                  now={now}
                  index={index}
                  arrival={arrival(comment.id)}
                  exiting={exiting}
                  onExited={() => shown.onExited(key)}
                  onSelect={(entry, selected) => void select(entry, selected)}
                  onAddressed={(entry, addressed) => void address(entry, addressed)}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </Group>
  );
}
