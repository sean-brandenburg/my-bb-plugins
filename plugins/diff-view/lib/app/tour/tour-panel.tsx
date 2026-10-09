import { useState } from "react";
import { Markdown, experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { DiffFile, TourState } from "../../types";
import { cn } from "../utils";
import { readPreference, writePreference } from "../state";
import { RISK_DOT } from "../risk";

const OPEN_KEY = "tourOpen";

/** The agent's reading guide, as one strip above the files: the first sentence when closed, the full tour when opened. */
export function TourPanel({
  tour,
  busy,
  onGenerate,
  onJump,
  onOpenThread,
  files,
}: {
  tour: TourState | null;
  busy: boolean;
  onGenerate: () => void;
  onJump: (path: string) => void;
  onOpenThread: (threadId: string) => void;
  files: DiffFile[];
}) {
  const [open, setOpenState] = useState(() => readPreference(OPEN_KEY) === "true");
  const setOpen = (value: boolean) => {
    setOpenState(value);
    writePreference(OPEN_KEY, String(value));
  };
  const narrative = tour?.narrative ?? null;
  const report = narrative?.status === "completed" ? narrative.report : null;
  const known = new Set(files.map((file) => file.path));
  const firstSentence = report === null ? "" : (report.summary.match(/^[\s\S]*?[.!?](?=\s|$)/u)?.[0] ?? report.summary);
  const keyCount = report?.readingOrder.filter((entry) => entry.role === "key").length ?? 0;
  const generateLabel = narrative === null ? "Generate tour" : tour?.stale ? "Regenerate for new head" : "Regenerate";
  return (
    <section className="border-b border-border text-xs">
      <div className="flex min-h-7 items-center gap-2 px-3">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left" onClick={() => setOpen(!open)} aria-expanded={open} disabled={report === null}>
          <Icon name="ChevronDown" className={cn("size-3 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90", report === null && "invisible")} />
          <span className="shrink-0 font-medium">Tour</span>
          {narrative === null ? (
            <span className="truncate text-muted-foreground">An agent can summarise this change and suggest a reading order.</span>
          ) : narrative.status === "running" ? (
            <span className="truncate text-muted-foreground">Writing… this strip fills in when the thread finishes.</span>
          ) : narrative.status === "failed" ? (
            <span className="truncate text-destructive">Failed. Open the thread for details.</span>
          ) : !open ? (
            <span className="min-w-0 truncate text-muted-foreground">{firstSentence}</span>
          ) : null}
          {report !== null && !open && keyCount > 0 ? <span className="shrink-0 rounded border border-border px-1 text-[10px] text-muted-foreground">{keyCount} key</span> : null}
          {tour?.stale ? <span className="shrink-0 rounded border border-amber-500/50 px-1 text-[10px] text-amber-700 dark:text-amber-300">stale</span> : null}
        </button>
        {narrative !== null ? (
          <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onOpenThread(narrative.threadId)}>
            thread
          </button>
        ) : null}
        {narrative?.status === "running" ? null : (
          <button type="button" className="shrink-0 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-state-hover hover:text-foreground disabled:opacity-50" disabled={busy} onClick={onGenerate}>
            {busy ? "Starting…" : generateLabel}
          </button>
        )}
      </div>
      {open && report !== null ? (
        <div className="flex flex-col gap-2 px-3 pb-3 pl-8 text-sm">
          <Markdown content={report.summary} className="text-sm" />
          <ol className="flex flex-col gap-0.5">
            {report.readingOrder.map((entry, index) => (
              <li key={`${entry.path}-${index}`} className="flex items-baseline gap-2 text-xs">
                <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">{index + 1}</span>
                <span className={cn("size-1.5 shrink-0 translate-y-[-1px] rounded-full", entry.role === "key" ? "bg-red-500" : entry.role === "supporting" ? "bg-sky-500" : "bg-slate-400")} title={entry.role} />
                {known.has(entry.path) ? (
                  <button type="button" className="shrink-0 font-mono hover:underline" onClick={() => onJump(entry.path)}>
                    {entry.path.split("/").pop()}
                  </button>
                ) : (
                  <code className="shrink-0 text-muted-foreground">{entry.path}</code>
                )}
                {entry.risk !== null ? <span className={cn("shrink-0 rounded px-1 text-[10px] text-white", RISK_DOT[entry.risk])} title={`review attention ${entry.risk}/5`}>{entry.risk}</span> : null}
                {entry.lines.length > 0 ? <span className="shrink-0 text-muted-foreground">L{entry.lines.slice(0, 4).join(", ")}</span> : null}
                {entry.note !== "" ? (
                  <span className={cn("min-w-0 truncate", entry.role === "mechanical" ? "text-muted-foreground" : "text-foreground")} title={entry.note}>
                    {entry.note}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          {report.watchOut.length > 0 ? (
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {report.watchOut.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
