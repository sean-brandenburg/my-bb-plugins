import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { DiffDelta } from "../types";
import { shortSha } from "./format";
import type { DiffSource } from "./source";
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

export function DeltaStrip({
  delta,
  newFindingCount,
  touchedFindingCount,
  onJump,
  actions,
}: {
  delta: DiffDelta;
  newFindingCount: number;
  touchedFindingCount: number;
  onJump: (path: string) => void;
  actions: ReactNode;
}) {
  return (
    <section className={cn("border-b border-border px-3 py-1 text-xs", enter.fade)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">Since you last looked</span>
        <span className="text-muted-foreground">
          {shortSha(delta.fromSha)} → {shortSha(delta.toSha)} · {delta.files.length} file{delta.files.length === 1 ? "" : "s"} changed
          {newFindingCount > 0 ? ` · ${newFindingCount} new finding${newFindingCount === 1 ? "" : "s"}` : ""}
          {touchedFindingCount > 0 ? ` · ${touchedFindingCount} finding${touchedFindingCount === 1 ? "" : "s"} touched` : ""}
        </span>
        {delta.files.slice(0, NAMED_FILES).map((file, index) => (
          <button
            key={file.path}
            type="button"
            className={cn("rounded border border-sky-500/40 px-1.5 py-px font-mono text-[11px] text-sky-700 hover:bg-sky-500/15 dark:text-sky-300", enter.pop, FAST, STAGGER, PRESS)}
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
