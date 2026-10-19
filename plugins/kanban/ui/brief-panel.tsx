import { useEffect, useState, type ReactNode } from "react";
import { ATTENTION_LEVEL_LABEL, type AttentionLevel } from "../shared/loop";
import type { Ticket } from "../shared/board";
import type { FindingSeverity, Review } from "../shared/review";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { Rpc } from "./data";
import { Badge, Group } from "./primitives";
import { toastError } from "./actions";
import { BRIEF_SECTION_TITLE, briefShown, handoffBrief, type BriefFinding, type BriefSection } from "./handoff-brief";

const LEVEL_TONE: Record<AttentionLevel, "success" | "warning" | "danger"> = { glance: "success", read: "warning", scrutinize: "danger" };
const SEVERITY_TONE: Record<FindingSeverity, "danger" | "warning" | "neutral"> = { critical: "danger", important: "warning", minor: "neutral" };

/** The card's reviews while the brief shows, refetched as the loop moves; null until they first load. */
function useBriefReviews(ticket: Ticket, rpc: Rpc): Review[] | null {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const shown = briefShown(ticket.loop);
  useEffect(() => {
    if (!shown) return;
    let cancelled = false;
    rpc.call("review_list", { ticketId: ticket.id }).then((result) => {
      if (!cancelled) setReviews(result.reviews);
    }, toastError);
    return () => {
      cancelled = true;
    };
  }, [shown, ticket.id, ticket.loop?.reviewId, ticket.loop?.phase, ticket.latestReview?.completedAt, rpc]);
  return reviews;
}

function LevelBadge({ level }: { level: AttentionLevel | null }) {
  return level === null ? <Badge tone="outline">no level</Badge> : <Badge tone={LEVEL_TONE[level]}>{ATTENTION_LEVEL_LABEL[level]}</Badge>;
}

function Items({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-1 text-xs">{children}</ul>;
}

function FindingItem({ id, severity, title, note }: { id: string; severity: FindingSeverity; title: string; note?: string }) {
  return (
    <li className="flex items-baseline gap-1.5">
      <Badge tone={SEVERITY_TONE[severity]}>{id}</Badge>
      <span>
        {title}
        {note ? <span className="text-muted-foreground"> · {note}</span> : null}
      </span>
    </li>
  );
}

function Subhead({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</div>;
}

function LevelBody({ section, onOpenThread }: { section: Extract<BriefSection, { kind: "level" }>; onOpenThread: (threadId: string) => void }) {
  const { escalation, reasons, failedThreadId } = section;
  return (
    <>
      {escalation !== null ? (
        <p className="text-xs font-medium text-destructive">
          {escalation}
          {failedThreadId === null ? null : (
            <>
              {" · "}
              <button type="button" className="underline-offset-2 hover:underline" onClick={() => onOpenThread(failedThreadId)}>
                open the failed thread
              </button>
            </>
          )}
        </p>
      ) : null}
      {reasons.length > 0 ? (
        <Items>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </Items>
      ) : (
        <p className="text-xs text-muted-foreground">{section.level === null ? "The loop stopped before the change was classified." : "No reasons beyond the default."}</p>
      )}
    </>
  );
}

function NotCoveredBody({ section }: { section: Extract<BriefSection, { kind: "not-covered" }> }) {
  if (section.items.length === 0) {
    return <p className="text-xs text-muted-foreground">{section.known ? "The review found nothing the checks miss." : "Unknown: no review ran."}</p>;
  }
  return (
    <Items>
      {section.items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </Items>
  );
}

function EvidenceBody({ section }: { section: Extract<BriefSection, { kind: "evidence" }> }) {
  return (
    <>
      <Subhead>Re-ran by the board{section.reranBy === "agent" ? " (command chosen by the agent)" : ""}</Subhead>
      {section.reran.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing re-ran yet.</p>
      ) : (
        <Items>
          {section.reran.map((outcome, index) => (
            <li key={index} className="flex items-baseline gap-1.5">
              <Badge tone={outcome.passed ? "success" : "danger"}>{outcome.passed ? "passed" : `exit ${outcome.exitCode}`}</Badge>
              <code className="font-mono">{outcome.command ?? "checks"}</code>
              <span className="text-muted-foreground">at {outcome.commit.slice(0, 7)}</span>
            </li>
          ))}
        </Items>
      )}
      <Subhead>Claimed by the agent, not re-run</Subhead>
      {section.claimed.length === 0 && section.screenshots.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing claimed.</p>
      ) : (
        <Items>
          {section.claimed.map((command, index) => (
            <li key={index} className="flex items-baseline gap-1.5">
              <Badge tone="outline">exit {command.exitCode}</Badge>
              <code className="font-mono">{command.command}</code>
            </li>
          ))}
          {section.screenshots.map((path) => (
            <li key={path}>
              screenshot <code className="font-mono">{path}</code>
            </li>
          ))}
        </Items>
      )}
    </>
  );
}

function HistoryBody({ section }: { section: Extract<BriefSection, { kind: "history" }> }) {
  return (
    <>
      <Items>
        {section.rounds.map((round) => (
          <li key={round.round}>
            <span className="font-medium">Round {round.round}</span>: {round.handed} handed,{" "}
            {round.resolved === null
              ? `not re-reviewed; the agent says ${round.claimed.fixed} fixed, ${round.claimed.disputed} disputed`
              : `resolved ${round.resolved.map((entry) => entry.title).join(", ")}`}
          </li>
        ))}
      </Items>
      {section.acceptedDisputes.length > 0 ? (
        <>
          <Subhead>Accepted disputes</Subhead>
          <Items>
            {section.acceptedDisputes.map((entry) => (
              <li key={entry.id}>
                {entry.title}
                <span className="text-muted-foreground">
                  {" "}
                  · agent: {entry.dispute.reason}
                  {entry.dispute.note ? ` · verifier: ${entry.dispute.note}` : ""}
                </span>
              </li>
            ))}
          </Items>
        </>
      ) : null}
      {section.polish.length > 0 ? (
        <>
          <Subhead>Nits and smells fixed</Subhead>
          <Items>
            {section.polish.map((entry) => (
              <li key={entry.id}>{entry.title}</li>
            ))}
          </Items>
        </>
      ) : null}
    </>
  );
}

function LeftOutBody({ section }: { section: Extract<BriefSection, { kind: "left-out" }> }) {
  const groups: Array<[string, BriefFinding[]]> = [
    ["Deferred", section.deferred],
    ["Dropped", section.dropped],
    ["Pre-existing", section.preExisting],
  ];
  return (
    <>
      {groups
        .filter(([, findings]) => findings.length > 0)
        .map(([label, findings]) => (
          <div key={label} className="flex flex-col gap-1">
            <Subhead>{label}</Subhead>
            <Items>
              {findings.map((finding) => (
                <FindingItem key={finding.id} {...finding} />
              ))}
            </Items>
          </div>
        ))}
      {section.leftOpen.length > 0 ? (
        <div className="flex flex-col gap-1">
          <Subhead>Minor, left open</Subhead>
          <Items>
            {section.leftOpen.map((finding) => (
              <FindingItem key={finding.id} {...finding} />
            ))}
          </Items>
        </div>
      ) : null}
    </>
  );
}

function DisputesBody({ section }: { section: Extract<BriefSection, { kind: "disputes" }> }) {
  return (
    <Items>
      {section.disputes.map((dispute) => (
        <li key={dispute.id} className="flex flex-col gap-0.5">
          <FindingItem id={dispute.id} severity={dispute.severity} title={dispute.title} />
          <span className="pl-2 text-muted-foreground">Agent: {dispute.agent || "no reason given"}</span>
          <span className="pl-2 text-muted-foreground">Verifier: {dispute.verifier || "no reason given"}</span>
        </li>
      ))}
    </Items>
  );
}

function sectionSummary(section: BriefSection): ReactNode {
  switch (section.kind) {
    case "level":
      return (
        <>
          {section.escalation !== null ? <Badge tone="danger">stopped</Badge> : null}
          <LevelBadge level={section.level} />
        </>
      );
    case "not-covered":
      return <span className="text-xs text-muted-foreground">{section.items.length === 0 ? "none listed" : section.items.length}</span>;
    case "evidence":
      return <span className="text-xs text-muted-foreground">{section.reran.length} re-ran · {section.claimed.length} claimed</span>;
    case "history":
      return <span className="text-xs text-muted-foreground">{section.rounds.length} round{section.rounds.length === 1 ? "" : "s"}</span>;
    case "left-out":
      return <span className="text-xs text-muted-foreground">{section.deferred.length + section.dropped.length + section.preExisting.length + section.leftOpen.length}</span>;
    case "disputes":
      return <Badge tone="danger">{section.disputes.length}</Badge>;
  }
}

function SectionBody({ section, onOpenThread }: { section: BriefSection; onOpenThread: (threadId: string) => void }) {
  switch (section.kind) {
    case "level":
      return <LevelBody section={section} onOpenThread={onOpenThread} />;
    case "not-covered":
      return <NotCoveredBody section={section} />;
    case "evidence":
      return <EvidenceBody section={section} />;
    case "history":
      return <HistoryBody section={section} />;
    case "left-out":
      return <LeftOutBody section={section} />;
    case "disputes":
      return <DisputesBody section={section} />;
  }
}

/** The handoff brief at the top of a monitored card waiting on you; each section's header is a stop for the card's keys. */
export function HandoffBrief({ ticket, rpc, onOpenThread }: { ticket: Ticket; rpc: Rpc; onOpenThread: (threadId: string) => void }) {
  const reviews = useBriefReviews(ticket, rpc);
  const sections = reviews === null ? null : handoffBrief(ticket.loop, reviews);
  if (sections === null) return null;
  return (
    <div data-kanban-brief="" className="flex flex-col gap-2">
      {sections.map((section) => (
        <Group key={section.kind} title={BRIEF_SECTION_TITLE[section.kind]} summary={sectionSummary(section)} defaultOpen>
          <SectionBody section={section} onOpenThread={onOpenThread} />
        </Group>
      ))}
    </div>
  );
}

/** The level, its reasons and the not-covered list above the changes page's diff; collapses to one line. */
export function HandoffStrip({ ticket, rpc, onOpenThread }: { ticket: Ticket; rpc: Rpc; onOpenThread: (threadId: string) => void }) {
  const [open, setOpen] = useState(true);
  const reviews = useBriefReviews(ticket, rpc);
  const sections = reviews === null ? null : handoffBrief(ticket.loop, reviews);
  if (sections === null) return null;
  const level = sections.find((section) => section.kind === "level")!;
  const notCovered = sections.find((section) => section.kind === "not-covered")!;
  return (
    <div data-kanban-brief-strip="" className="border-b border-border bg-muted/30 px-3 py-1.5">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full min-w-0 items-center gap-1.5 text-left text-xs">
        <Icon name="ChevronRight" className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="font-semibold">Handoff</span>
        <LevelBadge level={level.level} />
        <span className={cn("min-w-0 truncate", level.escalation !== null ? "text-destructive" : "text-muted-foreground")}>{level.escalation ?? level.reasons.join("; ")}</span>
      </button>
      {open ? (
        <div className="grid gap-3 py-1.5 pl-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Subhead>{BRIEF_SECTION_TITLE.level}</Subhead>
            <LevelBody section={level} onOpenThread={onOpenThread} />
          </div>
          <div className="flex flex-col gap-1">
            <Subhead>{BRIEF_SECTION_TITLE["not-covered"]}</Subhead>
            <NotCoveredBody section={notCovered} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
