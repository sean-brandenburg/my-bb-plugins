import { SHIMMER, cx, enter } from "bb-motion";

const LINE_WIDTHS = [92, 74, 84, 58, 68];

/** Skeleton lines for a pending load; `.ob-loading` delays their fade-in so a fast load never flashes them. */
export function LoadingLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div role="status" className={cx("ob-loading", enter.fade, className)}>
      <span className="sr-only">Loading…</span>
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} aria-hidden className={cx("ob-skeleton", SHIMMER)} style={{ width: `${LINE_WIDTHS[index % LINE_WIDTHS.length]}%` }} />
      ))}
    </div>
  );
}
