import { useState } from "react";
import type { ReactNode } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { type ProjectOption } from "./data";

/** GitHub links open in the system browser: an explicit target bypasses bb's in-app routing. */
export function ExternalLink({ href, className, children, title }: { href: string; className?: string; children: ReactNode; title?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={className}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  );
}

export function PushToggle({ push, onChange, disabled }: { push: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <label
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", disabled && "opacity-50")}
      title={push ? "The apply thread commits and pushes to the PR branch." : "The apply thread commits in its worktree and leaves pushing to you."}
    >
      <Checkbox checked={push} disabled={disabled} onCheckedChange={(checked) => onChange(checked === true)} aria-label="Push to the PR branch after applying" />
      and push
    </label>
  );
}

export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "outline" | "accent" | "warning" | "danger" | "success";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-4",
        tone === "neutral" && "bg-muted text-muted-foreground",
        tone === "outline" && "border border-border text-muted-foreground",
        tone === "accent" && "bg-primary/10 text-primary",
        tone === "warning" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        tone === "danger" && "bg-destructive/10 text-destructive",
        tone === "success" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      )}
    >
      {children}
    </span>
  );
}

export function ThreadStatusDot({ thread }: { thread: PluginSidebarThread | null | undefined }) {
  if (thread === undefined) {
    return <span title="Thread not loaded" className="size-2 rounded-full bg-border" />;
  }
  if (thread === null) return null;
  const status = thread.runtimeStatus;
  const busy = status === "active" || status === "starting" || status === "stopping" || status === "provisioning";
  const label = thread.hasPendingInteraction
    ? "Thread needs your input"
    : thread.isArchived
      ? "Thread archived"
      : `Thread ${status}`;
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "size-2 shrink-0 rounded-full",
        thread.hasPendingInteraction && "bg-amber-500",
        !thread.hasPendingInteraction && busy && "animate-pulse bg-primary",
        !thread.hasPendingInteraction && !busy && status === "error" && "bg-destructive",
        !thread.hasPendingInteraction && !busy && status !== "error" && "bg-muted-foreground/50",
      )}
    />
  );
}

export function Select({
  value,
  onChange,
  children,
  "aria-label": ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  "aria-label": string;
  className?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Textarea({
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  rows = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label": string;
  rows?: number;
}) {
  return (
    <textarea
      aria-label={ariaLabel}
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    />
  );
}

export function ProjectSelect({
  projects,
  value,
  onChange,
  allowNone,
  className,
}: {
  projects: ProjectOption[];
  value: string;
  onChange: (value: string) => void;
  allowNone: boolean;
  className?: string;
}) {
  return (
    <Select aria-label="Project" value={value} onChange={onChange} className={className}>
      {allowNone ? <option value="">No project (no thread)</option> : null}
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </Select>
  );
}

export const HEADER_ICON_BUTTON =
  "relative flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Compact control sizing for the card panel: the panel is narrow, so chrome stays small. */
export const COMPACT = "h-7 gap-1.5 px-2 text-xs [&_[data-icon-root]]:size-3.5";

/** A collapsible block whose header carries the one-line summary; details live inside. */
export function Group({
  title,
  summary,
  menu,
  defaultOpen,
  children,
}: {
  title: string;
  summary?: ReactNode;
  menu?: ReactNode;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-md border border-border">
      <div className="flex items-center gap-1 pl-1.5 pr-1.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-1.5 text-left hover:text-foreground"
        >
          <Icon name="ChevronDown" className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
          <span className="text-xs font-semibold text-foreground">{title}</span>
          {summary !== undefined ? <span className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">{summary}</span> : null}
        </button>
        {menu}
      </div>
      {open ? <div className="flex flex-col gap-2 border-t border-border px-2.5 py-2.5">{children}</div> : null}
    </section>
  );
}

export function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="pt-1 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </>
  );
}

export const MENU_ITEM_CLASS =
  "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-state-hover";
