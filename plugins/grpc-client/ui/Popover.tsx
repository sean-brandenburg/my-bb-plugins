import { useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useDismiss } from "./hooks";

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
  return (
    <div ref={root} className="relative min-w-0">
      {trigger}
      {open ? (
        <div role="dialog" aria-label={label} className={cn("absolute left-0 top-full z-30 mt-1 rounded-lg border border-border bg-background p-1.5 shadow-lg", className)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
