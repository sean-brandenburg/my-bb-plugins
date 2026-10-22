import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { DiffDelta } from "../types";
import { shortSha } from "./format";
import type { DiffSource } from "./source";
import { passesFindingFilter, type FindingFilter, type InlineFinding } from "./findings/findings";
import { cn } from "./utils";
import { FAST, PRESS, STAGGER, enter, stagger } from "./ui/motion";

/** Changed files named in the strip; the rest are counted as "+N more". */
const NAMED_FILES = 8;

/** What changed since the reviewer last looked, refetched when the head moves; null when the source does not track it. */
export function useDelta(source: DiffSource, headSha: string | null): DiffDelta | null {
  const [delta, setDelta] = useState<DiffDelta | null>(null);
  useEffect(() => {
    if (source.delta === undefined) setDelta(null);
    else source.delta().then(setDelta, () => setDelta(null));
  }, [source, headSha]);
  return delta;
}

/** " · 3 new findings (1 hidden)", naming how many the findings filter keeps out of the diff. */
function findingCount(findings: readonly InlineFinding[], filter: FindingFilter, noun: (count: number) => string): string {
  if (findings.length === 0) return "";
  const hidden = findings.filter((item) => !passesFindingFilter(item.finding.severity, filter)).length;
  return ` · ${findings.length} ${noun(findings.length)}${hidden > 0 ? ` (${hidden} hidden)` : ""}`;
}

export function DeltaStrip({
  delta,
  newFindings,
  touchedFindings,
  findingFilter,
  onJump,
  actions,
}: {
  delta: DiffDelta;
  newFindings: readonly InlineFinding[];
  touchedFindings: readonly InlineFinding[];
  findingFilter: FindingFilter;
  onJump: (path: string) => void;
  actions: ReactNode;
}) {
  return (
    <section className={cn("border-b border-border bg-muted/20 px-3 py-1.5 text-xs", enter.fade)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-foreground">Since you last looked</span>
        <span className="text-muted-foreground">
          {shortSha(delta.fromSha)} → {shortSha(delta.toSha)} · {delta.files.length} file{delta.files.length === 1 ? "" : "s"} changed
          {findingCount(newFindings, findingFilter, (count) => `new finding${count === 1 ? "" : "s"}`)}
          {findingCount(touchedFindings, findingFilter, (count) => `finding${count === 1 ? "" : "s"} touched`)}
        </span>
        {delta.files.slice(0, NAMED_FILES).map((file, index) => (
          <button
            key={file.path}
            type="button"
            className={cn("rounded-md border border-sky-500/40 px-1.5 py-px font-mono text-[11px] text-sky-700 hover:bg-sky-500/15 dark:text-sky-300", enter.pop, FAST, STAGGER, PRESS)}
            style={stagger(index)}
            title={file.path}
            onClick={() => onJump(file.path)}
          >
            {file.path.split("/").pop()}
          </button>
        ))}
        {delta.files.length > NAMED_FILES ? <span className="text-muted-foreground">+{delta.files.length - NAMED_FILES} more</span> : null}
        {actions}
      </div>
    </section>
  );
}
