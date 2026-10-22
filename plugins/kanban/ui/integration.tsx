import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { PRESS } from "bb-motion";
import type { Column, Ticket } from "../shared/board";
import type { Integration, IntegrationMember } from "../shared/dump";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { Rpc } from "./data";
import type { RunAction } from "./actions";
import { Badge, COMPACT, Group, ThreadStatusDot } from "./primitives";

const OUTCOME: Record<IntegrationMember["outcome"], { label: string; tone: "neutral" | "outline" | "accent" | "warning" | "danger" | "success" }> = {
  pending: { label: "in progress", tone: "outline" },
  ready: { label: "ready", tone: "accent" },
  nothing: { label: "nothing to merge", tone: "neutral" },
  unavailable: { label: "unavailable", tone: "warning" },
  merged: { label: "merged", tone: "success" },
  conflict: { label: "conflict", tone: "danger" },
  skipped: { label: "skipped", tone: "neutral" },
};

/** One badge for where the integration stands, for the card panel and the Proposals page. */
export function IntegrationStatusBadge({ integration }: { integration: Integration }) {
  const settled = integration.members.filter((member) => member.outcome !== "pending").length;
  switch (integration.status) {
    case "waiting":
      return <Badge tone="outline">{`waiting · ${settled}/${integration.members.length} done`}</Badge>;
    case "integrating":
      return <Badge tone="accent">integrating…</Badge>;
    case "integrated": {
      const conflicts = integration.members.filter((member) => member.outcome === "conflict").length;
      const checks = integration.checkExitCode === null ? "" : integration.checkExitCode === 0 ? " · checks passed" : ` · checks exit ${integration.checkExitCode}`;
      return <Badge tone={conflicts > 0 || (integration.checkExitCode ?? 0) !== 0 ? "warning" : "success"}>{`integrated${integration.commitSha === null ? "" : ` at ${integration.commitSha.slice(0, 7)}`}${conflicts > 0 ? ` · ${conflicts} conflict${conflicts === 1 ? "" : "s"}` : ""}${checks}`}</Badge>;
    }
    default:
      return <Badge tone="danger">failed</Badge>;
  }
}

/** The buttons every surface showing an integration offers: merge now (or again), and the integration thread. */
export function IntegrationActions({ integration, thread, rpc, pending, run, onOpenThread }: { integration: Integration; thread: PluginSidebarThread | null | undefined; rpc: Rpc; pending: boolean; run: RunAction; onOpenThread: (threadId: string) => void }) {
  const label = integration.status === "waiting" ? "Integrate now" : "Integrate again";
  return (
    <>
      {integration.threadId !== null ? (
        <Button type="button" variant="ghost" className={COMPACT} onClick={() => onOpenThread(integration.threadId!)}>
          <ThreadStatusDot thread={thread} />
          Integration thread
        </Button>
      ) : null}
      <span title={integration.status === "waiting" ? "Merge what has commits so far, done or not" : "Read every card's head again and merge afresh in the same worktree"}>
        <Button type="button" variant="secondary" className={COMPACT} disabled={pending || integration.status === "integrating"} onClick={() => void run(() => rpc.call("integration_run", { ticketId: integration.ticketId }), "Integrating")}>
          <Icon name="GitMerge" className="size-3.5" />
          {label}
        </Button>
      </span>
    </>
  );
}

/** The integration card's panel section: each member card's standing, the merge result, and the thread to test in. */
export function IntegrationGroup({
  integration,
  tickets,
  columns,
  threads,
  rpc,
  pending,
  run,
  onOpenTicket,
  onOpenThread,
}: {
  integration: Integration;
  tickets: readonly Ticket[];
  columns: Column[];
  threads: ReadonlyMap<string, PluginSidebarThread>;
  rpc: Rpc;
  pending: boolean;
  run: RunAction;
  onOpenTicket: (ticketId: string) => void;
  onOpenThread: (threadId: string) => void;
}) {
  return (
    <Group title="Integration" summary={<IntegrationStatusBadge integration={integration} />} defaultOpen>
      <p className="text-xs text-muted-foreground">
        {integration.status === "waiting"
          ? "Once every card below is done, their branches are merged into one fresh worktree and the project's checks run there, so the feature can be tested end to end before it lands."
          : integration.status === "integrating"
            ? "The integration thread is merging the branches and running the checks."
            : integration.status === "integrated"
              ? "The branches are merged in the integration thread's worktree; carry on there to test the feature end to end."
              : (integration.error ?? "The integration failed.")}
      </p>
      <ul className="flex flex-col gap-1">
        {integration.members.map((member) => {
          const ticket = tickets.find((entry) => entry.id === member.ticketId);
          const { label, tone } = OUTCOME[member.outcome];
          return (
            <li key={member.ticketId} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-state-hover">
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{member.proposalId}</span>
              <button type="button" className={cn("min-w-0 flex-1 truncate text-left hover:underline", ticket === undefined && "text-muted-foreground line-through")} onClick={() => ticket !== undefined && onOpenTicket(member.ticketId)}>
                {ticket?.title ?? "(deleted card)"}
              </button>
              {ticket !== undefined ? <span className="shrink-0 text-[11px] text-muted-foreground">{columns.find((column) => column.id === ticket.columnId)?.name ?? ticket.columnId}</span> : null}
              <Badge tone={tone} title={member.note || undefined}>
                {label}
                {member.headSha !== null ? <span className="font-mono"> {member.headSha.slice(0, 7)}</span> : null}
              </Badge>
              {ticket?.threadId != null ? (
                <button type="button" aria-label="Open the card's thread" className={cn("flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground", PRESS)} onClick={() => onOpenThread(ticket.threadId!)}>
                  <ThreadStatusDot thread={threads.get(ticket.threadId)} />
                </button>
              ) : (
                <span className="w-6 shrink-0" />
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-1.5">
        <IntegrationActions integration={integration} thread={integration.threadId === null ? null : threads.get(integration.threadId)} rpc={rpc} pending={pending} run={run} onOpenThread={onOpenThread} />
      </div>
    </Group>
  );
}
