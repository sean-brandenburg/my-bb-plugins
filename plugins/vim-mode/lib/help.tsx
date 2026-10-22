import { type ReactNode, useEffect, useRef, useState } from "react";
import { bindKeys } from "./handler.ts";
import type { KeyHelpSection, Keymap } from "./reader.ts";
import { createSearchBoxKeys, filterKeyHelp } from "./search.ts";

type Size = "normal" | "small";

/** A key cap. `small` fits one inside a line of hint text. */
export function Kbd({ children, className, size = "normal" }: { children: ReactNode; className?: string; size?: Size }) {
  const sizing = size === "small" ? "min-w-5 px-1 py-0 text-[11px]" : "min-w-6 px-1.5 py-0.5 text-xs";
  return <kbd className={`${sizing} rounded border border-border bg-muted text-center font-mono${className === undefined ? "" : ` ${className}`}`}>{children}</kbd>;
}

function KeyList({ keys, size }: { keys: KeyHelpSection["keys"]; size: Size }) {
  return (
    <dl className={size === "small" ? "grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-xs" : "grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm"}>
      {keys.map(({ keys: sequence, action }) => (
        <div key={action} className="contents">
          <dt className="flex gap-1">
            {sequence.map((key) => (
              <Kbd key={key} size={size}>
                {key}
              </Kbd>
            ))}
          </dt>
          <dd className="text-muted-foreground">{action}</dd>
        </div>
      ))}
    </dl>
  );
}

function KeySections({ sections, className, size }: { sections: readonly KeyHelpSection[]; className: string; size: Size }) {
  if (sections.length === 1 && sections[0]!.title === "") return <KeyList keys={sections[0]!.keys} size={size} />;
  return (
    <div className={className}>
      {sections.map((section) => (
        <section key={section.title} className={size === "small" ? "flex min-w-0 flex-col gap-1.5" : "flex flex-col gap-2"}>
          <h3 className={`${size === "small" ? "text-[11px]" : "text-xs"} font-medium uppercase tracking-wide text-muted-foreground`}>{section.title}</h3>
          <KeyList keys={section.keys} size={size} />
        </section>
      ))}
    </div>
  );
}

const SEARCH_KEYMAP: Keymap<"search"> = { "/": "search" };

/** The dialog `/` searches from: the one holding the list, or the list itself outside one. */
const SEARCH_SCOPE = '[role="dialog"], [role="alertdialog"]';

function SearchableKeySections({ sections, className, size }: { sections: readonly KeyHelpSection[]; className: string; size: Size }) {
  const root = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const list = root.current;
    const input = box.current;
    if (list === null || input === null) return;
    const view = list.ownerDocument.defaultView ?? window;
    const toKeys = () => list.focus({ preventScroll: true });
    const unbind = bindKeys(list.closest(SEARCH_SCOPE) ?? list, {
      keymap: SEARCH_KEYMAP,
      onCommand: () => {
        input.focus({ preventScroll: true });
        input.select();
      },
    });
    const boxKeys = createSearchBoxKeys({
      commit: toKeys,
      cancel: () => {
        setQuery("");
        toKeys();
      },
      cancelOnEmptyBackspace: true,
    });
    // A Radix dialog closes on an Escape it hears in document capture, so the box's keys have to
    // run before that, in window capture, and stop there.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target === input && boxKeys.handle(event)) event.stopPropagation();
    };
    view.addEventListener("keydown", onKeyDown, true);
    return () => {
      unbind();
      view.removeEventListener("keydown", onKeyDown, true);
      boxKeys.dispose();
    };
  }, []);

  const shown = filterKeyHelp(sections, query);
  return (
    <div ref={root} tabIndex={-1} className={`flex flex-col outline-none ${size === "small" ? "gap-3" : "gap-4"}`}>
      {/* Out of the tab order so a dialog's opening focus doesn't land in it, leaving Escape to close the dialog. */}
      <input
        ref={box}
        data-vim-ignore=""
        type="search"
        tabIndex={-1}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search keys ( / )"
        aria-label="Search keys"
        className={`w-full rounded border border-border bg-background px-2 outline-none focus:ring-2 focus:ring-ring/60 ${size === "small" ? "py-0.5 text-xs" : "py-1 text-sm"}`}
      />
      {shown.length === 0 ? <p className={`text-muted-foreground ${size === "small" ? "text-xs" : "text-sm"}`}>No keys match.</p> : <KeySections sections={shown} className={className} size={size} />}
    </div>
  );
}

/**
 * A shortcuts list for a `?` dialog: titled sections in two columns, or one plain list when
 * there's a single untitled section. `className` replaces the sections' grid layout, for a
 * container narrower than the viewport. `search` adds a box above the list that `/` focuses from
 * anywhere in the dialog holding it, filtering the list as you type; Enter goes back to the keys
 * keeping the filter, Escape drops it. Leave it off where the page's own `/` is in reach.
 */
export function KeyHelp({ sections, className = "grid gap-6 sm:grid-cols-2", size = "normal", search = false }: { sections: readonly KeyHelpSection[]; className?: string; size?: Size; search?: boolean }) {
  return search ? <SearchableKeySections sections={sections} className={className} size={size} /> : <KeySections sections={sections} className={className} size={size} />;
}

/**
 * For a dialog opened by a key: it has no trigger to hand focus back to, so it would land on the
 * page body. Call while rendering with the dialog's open state; pass the result to Radix's
 * `onCloseAutoFocus` (bb's `onAfterCloseAutoFocus`).
 */
export function useFocusReturn(open: boolean): () => void {
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  wasOpen.current = open;
  return () => {
    if (opener.current?.isConnected === true) opener.current.focus({ preventScroll: true });
  };
}
