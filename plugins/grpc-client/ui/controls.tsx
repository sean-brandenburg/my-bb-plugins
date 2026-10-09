import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="max-w-lg space-y-3 text-center text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (value: T) => void }) {
  return (
    <div className="flex items-center gap-1" role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm",
            value === option.id ? "bg-state-active font-medium text-foreground" : "text-muted-foreground hover:bg-state-hover hover:text-foreground",
          )}
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
    <div className="flex items-center rounded-md border border-border p-0.5" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className={cn("rounded px-2 py-0.5 text-xs", value === option.id ? "bg-state-active text-foreground" : "text-muted-foreground hover:text-foreground")}
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
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-state-hover disabled:pointer-events-none disabled:opacity-50"
      onClick={onClick}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {checked ? <Icon name="Check" className="size-3.5 shrink-0" /> : null}
    </button>
  );
}

export function Notice({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warning" | "error" }) {
  return (
    <p
      className={cn(
        "mb-3 rounded-md px-3 py-2 text-xs",
        tone === "error" && "bg-destructive/10 text-destructive",
        tone === "warning" && "bg-amber-500/10 text-amber-800 dark:text-amber-200",
        tone === "muted" && "bg-muted/50 text-muted-foreground",
      )}
    >
      {children}
    </p>
  );
}
