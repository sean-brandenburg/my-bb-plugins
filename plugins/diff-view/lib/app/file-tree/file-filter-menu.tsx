// The "Filter files" menu, opened by `gf` or the funnel on the file list: j / k move, Space or Enter ticks, Escape closes.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { DiffFile } from "../../types";
import {
  CHANGE_TYPE_LABEL,
  NO_EXTENSION,
  NO_FILE_FILTER,
  fileFilterActive,
  filterOptions,
  toggleChangeType,
  toggleExtension,
  type FileFilter,
  type FileMarks,
} from "../file-filter";
import { usePortalScopeProps } from "../portal-scope";
import { FAST, PRESS, enter } from "../ui/motion";
import { useMenuKeys } from "../ui/vim-keys";
import { cn } from "../utils";

const MENU_WIDTH_PX = 248;
const ANCHOR_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;

/** Marks the funnel buttons, so focus moving onto one keeps the menu open for the button's own toggle. */
export const FILE_FILTER_BUTTON = "data-file-filter-button";

const ITEM = cn("flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-state-hover focus-visible:bg-state-hover focus-visible:outline-none aria-disabled:opacity-50", PRESS);

function Heading({ children }: { children: ReactNode }) {
  return (
    <div role="presentation" className="px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function CheckItem({ checked, label, count, onToggle }: { checked: boolean; label: ReactNode; count: number; onToggle: () => void }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={checked} tabIndex={-1} className={ITEM} onClick={onToggle}>
      <span className={cn("flex size-3.5 shrink-0 items-center justify-center rounded-sm border border-input", checked && "border-foreground bg-foreground text-background")} aria-hidden="true">
        {checked ? <Icon name="Check" className="size-3" /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}

/** The funnel on the file list's header; filled in while a filter is on. */
export function FileFilterButton({ active, onClick }: { active: boolean; onClick: (anchor: Element) => void }) {
  return (
    <button
      type="button"
      {...{ [FILE_FILTER_BUTTON]: "" }}
      className={cn("rounded p-0.5 hover:bg-state-hover hover:text-foreground", PRESS, active && "text-primary")}
      aria-label="Filter files"
      aria-haspopup="menu"
      title={active ? "Files are filtered (gf)" : "Filter files (gf)"}
      onClick={(event) => onClick(event.currentTarget)}
    >
      <Icon name="diff-view-funnel" className={cn("size-3.5", active && "fill-current")} />
    </button>
  );
}

function place(anchor: DOMRect): { top: number; left: number } {
  return { top: anchor.bottom + ANCHOR_GAP_PX, left: Math.max(VIEWPORT_MARGIN_PX, Math.min(anchor.left, window.innerWidth - MENU_WIDTH_PX - VIEWPORT_MARGIN_PX)) };
}

/**
 * Extensions and change types, ticked when shown, with every file of the diff counted; then hide viewed, only files with
 * comments, only files with findings (where the view has findings), and Clear. Ticking keeps the menu open.
 */
export function FileFilterMenu({
  files,
  filter,
  marks,
  findings,
  anchor,
  onChange,
  onClose,
}: {
  files: readonly DiffFile[];
  filter: FileFilter;
  marks: FileMarks;
  /** Whether the view has review findings, so "Only files with findings" means something. */
  findings: boolean;
  anchor: DOMRect;
  onChange: (filter: FileFilter) => void;
  /** `refocus` is false when focus already left for something else. */
  onClose: (refocus: boolean) => void;
}) {
  const portalScope = usePortalScopeProps();
  const menu = useRef<HTMLDivElement | null>(null);
  const menuKeys = useMenuKeys();
  const options = useMemo(() => filterOptions(files), [files]);
  const count = (paths: ReadonlySet<string>) => files.filter((file) => paths.has(file.path)).length;
  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus({ preventScroll: true });
  }, []);
  const active = fileFilterActive(filter);
  return createPortal(
    <div
      {...portalScope}
      ref={menu}
      role="menu"
      aria-label="Filter files"
      className={cn("fixed z-50 flex max-h-[70vh] flex-col overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md", enter.scale, FAST)}
      style={{ ...place(anchor), width: MENU_WIDTH_PX }}
      onKeyDown={(event) => {
        if (menuKeys(event)) return;
        if (event.metaKey || event.altKey || event.ctrlKey) return;
        if (event.key === "Escape" || event.key === "q") {
          event.preventDefault();
          event.stopPropagation();
          onClose(true);
          return;
        }
        // Handled here rather than by the button's own Space (on key up) and Enter, so each ticks once and nothing scrolls.
        if ((event.key === " " || event.key === "Enter") && event.target instanceof HTMLElement && event.target.matches('[role^="menuitem"]')) {
          event.preventDefault();
          event.stopPropagation();
          if (event.target.getAttribute("aria-disabled") !== "true") event.target.click();
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        if (next instanceof Element && next.closest(`[${FILE_FILTER_BUTTON}]`) !== null) return;
        onClose(false);
      }}
    >
      <Heading>File extensions</Heading>
      {options.extensions.map(({ value, count: files }) => (
        <CheckItem key={`ext:${value}`} checked={!filter.hiddenExtensions.has(value)} label={value === NO_EXTENSION ? "No extension" : value} count={files} onToggle={() => onChange(toggleExtension(filter, value))} />
      ))}
      <Heading>Change type</Heading>
      {options.changeTypes.map(({ value, count: files }) => (
        <CheckItem key={`type:${value}`} checked={!filter.hiddenChangeTypes.has(value)} label={CHANGE_TYPE_LABEL[value]} count={files} onToggle={() => onChange(toggleChangeType(filter, value))} />
      ))}
      <div role="separator" className="my-1 h-px bg-border" />
      <CheckItem checked={filter.hideViewed} label="Hide viewed files" count={count(marks.viewed)} onToggle={() => onChange({ ...filter, hideViewed: !filter.hideViewed })} />
      <CheckItem checked={filter.onlyComments} label="Only files with comments" count={count(marks.withComments)} onToggle={() => onChange({ ...filter, onlyComments: !filter.onlyComments })} />
      {findings || filter.onlyFindings ? (
        <CheckItem checked={filter.onlyFindings} label="Only files with findings" count={count(marks.withFindings)} onToggle={() => onChange({ ...filter, onlyFindings: !filter.onlyFindings })} />
      ) : null}
      <div role="separator" className="my-1 h-px bg-border" />
      <button type="button" role="menuitem" tabIndex={-1} aria-disabled={!active} className={ITEM} onClick={() => active && onChange(NO_FILE_FILTER)}>
        Clear filters
      </button>
    </div>,
    document.body,
  );
}
