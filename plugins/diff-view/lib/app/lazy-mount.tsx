import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

/** How far outside the scroller's viewport content starts mounting, so it is ready by the time it scrolls in. */
const MOUNT_MARGIN = "1000px 0px";
/** Placeholder height per estimated line, and its bounds, until the real content mounts. */
const PLACEHOLDER_LINE_PX = 20;
const PLACEHOLDER_MIN_PX = 80;
const PLACEHOLDER_MAX_PX = 600;

/** Mounts its content once it scrolls near the viewport, then keeps it mounted; the placeholder height keeps far-off files out of view until then. */
export function LazyMount({ root, estimateLines, children }: { root: RefObject<HTMLElement | null>; estimateLines: number; children: () => ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (mounted) return;
    const node = ref.current;
    if (node === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setMounted(true);
      },
      { root: root.current, rootMargin: MOUNT_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mounted, root]);
  return (
    <div ref={ref} style={mounted ? undefined : { minHeight: Math.min(Math.max(estimateLines * PLACEHOLDER_LINE_PX, PLACEHOLDER_MIN_PX), PLACEHOLDER_MAX_PX) }}>
      {mounted ? children() : null}
    </div>
  );
}
