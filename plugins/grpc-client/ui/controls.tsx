import type { ReactNode } from "react";
import { cx, enter, PRESS, useLateMount } from "bb-motion";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/** The keyboard cursor on list rows and menu items. */
export const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring";

export function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="max-w-lg space-y-3 text-center text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

/** A bordered strip that a row of choices sits in, so they read as one control the chosen one stands out of. */
export const STRIP = "inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/50 p-0.5";
export const STRIP_OPTION = "inline-flex h-6 items-center rounded-[5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";
export const STRIP_ON = "bg-background font-medium text-foreground shadow-sm";
export const STRIP_OFF = "text-muted-foreground hover:text-foreground";

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (value: T) => void }) {
  return (
    <div className={STRIP} role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className={cn(STRIP_OPTION, "px-2.5 text-sm", PRESS, value === option.id ? STRIP_ON : STRIP_OFF)}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className={STRIP} role="radiogroup">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className={cn(STRIP_OPTION, "px-2.5 text-sm", PRESS, value === option.id ? STRIP_ON : STRIP_OFF)}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function MenuItem({ children, onClick, disabled, checked }: { children: ReactNode; onClick: () => void; disabled?: boolean; checked?: boolean }) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked}
      disabled={disabled}
      className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-state-hover disabled:pointer-events-none disabled:opacity-50", FOCUS_RING)}
      onClick={onClick}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {checked ? <CheckMark /> : null}
    </button>
  );
}

/** Pops when toggled on, but not when the menu holding it opens. */
function CheckMark() {
  const late = useLateMount();
  return (
    <span className={cx("flex shrink-0", late && enter.pop)}>
      <Icon name="Check" className="size-3.5" />
    </span>
  );
}

export function Notice({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warning" | "error" }) {
  return (
    <p
      className={cn(
        "mb-3 rounded-md px-3 py-2 text-xs",
        enter.fade,
        tone === "error" && "bg-destructive/10 text-destructive",
        tone === "warning" && "bg-amber-500/10 text-amber-800 dark:text-amber-200",
        tone === "muted" && "bg-muted/50 text-muted-foreground",
      )}
    >
      {children}
    </p>
  );
}
