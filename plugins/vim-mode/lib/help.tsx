import { type ReactNode, useRef } from "react";
import type { KeyHelpSection } from "./reader.ts";

/** A key cap. `small` fits one inside a line of hint text. */
export function Kbd({ children, className, size = "normal" }: { children: ReactNode; className?: string; size?: "normal" | "small" }) {
  const sizing = size === "small" ? "min-w-5 px-1 py-0 text-[11px]" : "min-w-6 px-1.5 py-0.5 text-xs";
  return <kbd className={`${sizing} rounded border border-border bg-muted text-center font-mono${className === undefined ? "" : ` ${className}`}`}>{children}</kbd>;
}

function KeyList({ keys }: { keys: KeyHelpSection["keys"] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
      {keys.map(({ keys: sequence, action }) => (
        <div key={action} className="contents">
          <dt className="flex gap-1">
            {sequence.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </dt>
          <dd className="text-muted-foreground">{action}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A shortcuts list for a `?` dialog: titled sections in two columns, or one plain list when
 * there's a single untitled section. `className` replaces the sections' grid layout, for a
 * container narrower than the viewport.
 */
export function KeyHelp({ sections, className = "grid gap-6 sm:grid-cols-2" }: { sections: readonly KeyHelpSection[]; className?: string }) {
  if (sections.length === 1 && sections[0]!.title === "") return <KeyList keys={sections[0]!.keys} />;
  return (
    <div className={className}>
      {sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{section.title}</h3>
          <KeyList keys={section.keys} />
        </section>
      ))}
    </div>
  );
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
