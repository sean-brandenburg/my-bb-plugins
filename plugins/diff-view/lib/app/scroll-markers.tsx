import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { cn } from "./utils";
import { scrollToElement } from "./scroll";
import { enter } from "./ui/motion";

interface Marker {
  /** Position along the scroller, as a fraction of its full height. */
  fraction: number;
  pending: boolean;
  element: Element;
}

/**
 * Where comments and findings sit along the scroller, for the marker track beside its scrollbar. Recomputed when
 * anything in `watch` changes, on DOM mutations inside the scroller, on window resize, and whenever `recompute` is called.
 */
export function useScrollMarkers(mainRef: RefObject<HTMLElement | null>, watch: readonly unknown[]): { markers: Marker[]; recompute: () => void } {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const recompute = () => {
    const main = mainRef.current;
    if (main === null) return;
    const mainTop = main.getBoundingClientRect().top;
    const total = main.scrollHeight;
    const next = Array.from(main.querySelectorAll("[data-comment-anchor], [data-finding-anchor]")).map((element) => ({
      fraction: total === 0 ? 0 : (element.getBoundingClientRect().top - mainTop + main.scrollTop) / total,
      pending: element.getAttribute("data-comment-state") === "pending" || element.hasAttribute("data-finding-anchor"),
      element,
    }));
    setMarkers((current) => (current.length === next.length && current.every((marker, index) => Math.abs(marker.fraction - next[index]!.fraction) < 0.001 && marker.pending === next[index]!.pending) ? current : next));
  };
  useEffect(() => {
    const main = mainRef.current;
    if (main === null) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(recompute);
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(main, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, watch);
  return { markers, recompute };
}

export function ScrollMarkers({ markers, mainRef }: { markers: Marker[]; mainRef: RefObject<HTMLElement | null> }) {
  if (markers.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 w-2" aria-hidden="true">
      {markers.map((marker, index) => (
        <button
          key={index}
          type="button"
          tabIndex={-1}
          className={cn("pointer-events-auto absolute right-0 h-1 w-2 rounded-l-sm", enter.fade, marker.pending ? "bg-amber-500" : "bg-muted-foreground/50")}
          style={{ top: `calc(${marker.fraction * 100}% - 2px)` }}
          title={marker.pending ? "Pending comment" : "Comment"}
          onClick={() => {
            if (mainRef.current !== null) scrollToElement(mainRef.current, marker.element);
          }}
        />
      ))}
    </div>
  );
}
