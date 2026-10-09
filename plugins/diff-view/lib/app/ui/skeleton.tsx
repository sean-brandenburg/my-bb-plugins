import { cn } from "../utils";
import { SHIMMER, enter } from "./motion";

/** Held back this long (the fade fills backwards) so a quick load never flashes the placeholder. */
const SKELETON_DELAY = "150ms";

/** Placeholder bars with a loading sheen while content is on its way. */
export function SkeletonLines({ widths, label, className, lineClassName }: { widths: readonly string[]; label: string; className?: string; lineClassName?: string }) {
  return (
    <div role="status" className={cn("flex flex-col gap-2", enter.fade, className)} style={{ animationDelay: SKELETON_DELAY }}>
      <span className="sr-only">{label}</span>
      {widths.map((width, index) => (
        <div key={index} aria-hidden="true" className={cn("relative h-3 overflow-hidden rounded bg-muted/60", SHIMMER, lineClassName)} style={{ width }} />
      ))}
    </div>
  );
}
