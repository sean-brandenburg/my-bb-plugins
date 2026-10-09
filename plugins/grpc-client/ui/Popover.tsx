import { useRef } from "react";
import type { ReactNode } from "react";
import { enter, exit, speed, usePresence, EntranceScope } from "bb-motion";
import { cn } from "@/lib/utils";
import { useDismiss, useInertWhileClosing } from "./hooks";

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
  const panel = useRef<HTMLDivElement>(null);
  const presence = usePresence(open);
  useInertWhileClosing(root, panel, presence.exiting);
  return (
    <div ref={root} className="relative min-w-0">
      {trigger}
      {presence.mounted ? (
        <div
          ref={panel}
          role="dialog"
          aria-label={label}
          aria-hidden={presence.exiting || undefined}
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
