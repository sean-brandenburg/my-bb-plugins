import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { getProjectColor } from "../rows/ProjectMonogram.js";

/**
 * The "you are here" bar on the current project and thread, in the project's
 * monogram color so the two read as one location. Its row must be `relative`.
 */
export function CurrentMarker({ projectId }: { projectId: string | null }) {
  return (
    <span
      aria-hidden="true"
      data-picker-current-marker=""
      className="pointer-events-none absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-foreground/70"
      style={
        projectId === null
          ? undefined
          : { backgroundColor: getProjectColor(projectId) }
      }
    />
  );
}

/** The trailing number slot every row shares, so numbers land in one column. */
export const ROW_NUMBER_CLASS =
  "w-7 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground";

/**
 * A ruled header over a run of rows: the name, a hairline out to the right
 * edge, and the run's count in the rows' number column. Not an option, so keys
 * skip it. `accent` marks the one section that asks for attention.
 */
export function GroupLabel({
  label,
  count,
  accent = false,
  className,
  style,
}: {
  label: string;
  count?: number;
  accent?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      role="presentation"
      style={style}
      className={cn(
        "flex h-7 select-none items-center gap-2 px-2 pt-1.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {accent ? (
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
      ) : null}
      <span className={cn("shrink-0", accent && "text-foreground")}>{label}</span>
      <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-border" />
      {count === undefined ? null : (
        <span className={cn(ROW_NUMBER_CLASS, accent && "font-medium text-foreground")}>
          {count}
        </span>
      )}
    </div>
  );
}
