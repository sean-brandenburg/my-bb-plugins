import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useStored } from "./storage";

/** Two panes with a draggable divider; the split ratio is remembered. */
export function SplitPane({ vertical, first, second }: { vertical: boolean; first: ReactNode; second: ReactNode }) {
  const [ratio, setRatio] = useStored<number>(vertical ? "split:vertical" : "split:horizontal", 0.55);
  const container = useRef<HTMLDivElement>(null);
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const node = container.current;
    if (node === null) return;
    const rect = node.getBoundingClientRect();
    const move = (moveEvent: PointerEvent) => {
      const next = vertical ? (moveEvent.clientY - rect.top) / rect.height : (moveEvent.clientX - rect.left) / rect.width;
      setRatio(Math.min(0.8, Math.max(0.2, next)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  return (
    <div ref={container} className={cn("flex min-h-0 min-w-0 flex-1", vertical ? "flex-col" : "flex-row")}>
      <div className="flex min-h-0 min-w-0 flex-col" style={{ flex: `${ratio} 1 0` }}>
        {first}
      </div>
      <div
        role="separator"
        aria-orientation={vertical ? "horizontal" : "vertical"}
        className={cn("group relative shrink-0 bg-border", vertical ? "h-px cursor-row-resize" : "w-px cursor-col-resize")}
        onPointerDown={startDrag}
      >
        <div className={cn("absolute z-10 group-hover:bg-ring/30", vertical ? "inset-x-0 -top-1 h-2" : "inset-y-0 -left-1 w-2")} />
      </div>
      <div className="flex min-h-0 min-w-0 flex-col" style={{ flex: `${1 - ratio} 1 0` }}>
        {second}
      </div>
    </div>
  );
}
