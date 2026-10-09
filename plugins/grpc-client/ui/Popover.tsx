import { useRef } from "react";
import type { ReactNode } from "react";
import { enter, exit, speed, usePresence } from "bb-motion";
import { cn } from "@/lib/utils";
import { useDismiss } from "./hooks";
import { EntranceScope } from "./presence";

/** An anchored panel that closes on outside click or Escape. */
export function Popover({
  open,
  onOpenChange,
  trigger,
  label,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useDismiss(root, open, onOpenChange);
  const presence = usePresence(open);
  return (
    <div ref={root} className="relative min-w-0">
      {trigger}
      {presence.mounted ? (
        <div
          role="dialog"
          aria-label={label}
          className={cn(
            "absolute left-0 top-full z-30 mt-1 rounded-lg border border-border bg-background p-1.5 shadow-lg",
            presence.exiting ? exit.fade : [enter.drop, speed.fast],
            className,
          )}
          onAnimationEnd={presence.onAnimationEnd}
        >
          <EntranceScope>{children}</EntranceScope>
        </div>
      ) : null}
    </div>
  );
}
