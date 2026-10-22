import type { TimelineBucket } from "../contract";
import { formatCount } from "./format";
import { axisLabels, bucketSpanLabel } from "./time";

interface TimelineProps {
  /** One entry per column, empty buckets included, oldest first. */
  buckets: readonly TimelineBucket[];
  bucketMs: number;
  offsetMs: number;
  pinned: number | null;
  onPin: (start: number | null) => void;
}

/**
 * Events per bucket as a strip of columns. It is a toolbar row: h and l step across the columns, Enter pins one
 * so the rest of the page shows only that stretch.
 */
export function Timeline({ buckets, bucketMs, offsetMs, pinned, onPin }: TimelineProps) {
  const largest = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const labels = axisLabels(
    buckets.map((bucket) => bucket.start),
    bucketMs,
    offsetMs,
  );
  return (
    <div data-nav-row="toolbar" className="flex flex-col" aria-label="Events over time">
      <div className="flex h-16 items-end gap-0.5">
        {buckets.map((bucket) => {
          const isPinned = pinned === bucket.start;
          return (
            <button
              key={bucket.start}
              type="button"
              tabIndex={-1}
              aria-pressed={isPinned}
              aria-label={`${bucketSpanLabel(bucket.start, bucketMs)}: ${formatCount(bucket.count)} events`}
              title={`${bucketSpanLabel(bucket.start, bucketMs)}: ${formatCount(bucket.count)} events`}
              onClick={() => onPin(isPinned ? null : bucket.start)}
              className="group flex h-full min-w-0 flex-1 items-end rounded-sm outline-none hover:bg-accent/60 focus:bg-accent focus:ring-1 focus:ring-ring/60"
            >
              <span
                aria-hidden
                className={`block w-full rounded-t-[3px] transition-[height] duration-200 motion-reduce:transition-none ${isPinned ? "bg-primary" : "bg-primary/45 group-hover:bg-primary/70 group-focus:bg-primary/70"}`}
                style={{ height: bucket.count === 0 ? 0 : `max(2px, ${(bucket.count / largest) * 100}%)` }}
              />
            </button>
          );
        })}
      </div>
      <div className="relative mt-0.5 h-4 border-t border-border" aria-hidden>
        {labels.map((label, index) =>
          label === null ? null : (
            <span
              key={buckets[index]!.start}
              className="absolute top-0.5 whitespace-nowrap border-l border-border pl-1 text-[10px] leading-none text-muted-foreground"
              style={{ left: `${(index / buckets.length) * 100}%` }}
            >
              {label}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
