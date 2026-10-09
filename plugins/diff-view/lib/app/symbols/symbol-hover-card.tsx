import { createPortal } from "react-dom";
import { usePortalScopeProps } from "../portal-scope";
import { cn } from "../utils";
import type { SymbolData } from "./symbol-peek";

/** Source lines previewed under the definition's location. */
const PREVIEW_LINES = 10;
/** Room the card needs below its anchor before it flips above; about its tallest. */
const FLIP_ABOVE_PX = 320;
/** Keeps the card's right edge on screen; a little over its 36rem width. */
const RIGHT_EDGE_PX = 600;
const ANCHOR_GAP_PX = 6;
const VIEWPORT_MARGIN_PX = 8;

/**
 * The ⌘-hover card: where a symbol is defined and its first lines, before you commit to a peek. Portalled to the body
 * because the view's container-query root is the containing block for `fixed` descendants, and its anchor is in
 * viewport coordinates.
 */
export function SymbolHoverCard({ symbol, data, anchor }: { symbol: string; data: SymbolData | undefined; anchor: DOMRect }) {
  const portalScope = usePortalScopeProps();
  const definition = data?.lookup?.definitions[0] ?? null;
  const context = definition?.context ?? null;
  const lines = context === null ? [] : context.lines.slice(0, PREVIEW_LINES);
  const below = anchor.bottom + FLIP_ABOVE_PX < window.innerHeight;
  return createPortal(
    <div
      {...portalScope}
      role="tooltip"
      className="pointer-events-none fixed z-50 w-[36rem] max-w-[90vw] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
      style={{
        top: below ? anchor.bottom + ANCHOR_GAP_PX : undefined,
        bottom: below ? undefined : window.innerHeight - anchor.top + ANCHOR_GAP_PX,
        left: Math.max(VIEWPORT_MARGIN_PX, Math.min(anchor.left, window.innerWidth - RIGHT_EDGE_PX)),
      }}
    >
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-2 py-1 text-xs">
        <code className="font-medium">{symbol}</code>
        {data === undefined ? (
          <span className="text-muted-foreground">searching…</span>
        ) : definition === null ? (
          <span className="text-muted-foreground">no definition found</span>
        ) : (
          <span className="min-w-0 truncate font-mono text-muted-foreground">
            {definition.path}
            {definition.line !== null ? `:${definition.line}` : ""}
            {(data.lookup?.definitions.length ?? 0) > 1 ? ` · +${data.lookup!.definitions.length - 1} more` : ""}
          </span>
        )}
        <span className="ml-auto shrink-0 text-muted-foreground">⌘-click to peek</span>
      </div>
      {lines.length > 0 ? (
        <pre className="max-h-60 overflow-hidden px-2 py-1 font-mono text-[11px] leading-4">
          {lines.map((text, index) => {
            const line = context!.startLine + index;
            return (
              <div key={line} className={cn("whitespace-pre", line === definition!.line && "bg-amber-500/15 font-semibold")}>
                <span className="mr-2 inline-block w-8 text-right text-muted-foreground/60">{line}</span>
                {text}
              </div>
            );
          })}
        </pre>
      ) : definition !== null && definition.snippet !== "" ? (
        <pre className="px-2 py-1 font-mono text-[11px]">{definition.snippet}</pre>
      ) : null}
    </div>,
    document.body,
  );
}
