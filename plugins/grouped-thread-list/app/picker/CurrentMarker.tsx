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

/**
 * A hairline across the top of a row. Rows are `relative` and `rounded-md`, so
 * a pseudo-element keeps the line straight where a border would curve.
 */
export const ROW_DIVIDER =
  "before:pointer-events-none before:absolute before:inset-x-2 before:top-0 before:h-px before:bg-border/50";

/**
 * A row gets the divider unless a group label sits above it or the highlight
 * touches it, so the highlight's rounded edges stay clean.
 */
export function showsRowDivider(
  startsGroup: boolean,
  painted: boolean,
  previousPainted: boolean,
): boolean {
  return !startsGroup && !painted && !previousPainted;
}

/** A small uppercase label over a run of rows; not an option, so keys skip it. */
export function GroupLabel({
  label,
  className,
  style,
}: {
  label: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      role="presentation"
      style={style}
      className={cn(
        "flex h-6 select-none items-end px-2 pb-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground/80",
        className,
      )}
    >
      {label}
    </div>
  );
}
