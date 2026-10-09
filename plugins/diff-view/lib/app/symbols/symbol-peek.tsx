import { useEffect, useState } from "react";
import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { SymbolLookup, SymbolUsages } from "../../types";
import { cn } from "../utils";
import { FAST, PRESS, enter } from "../ui/motion";
import { errorMessage } from "../format";
import { useDiffSource } from "../source";
import { useHostThemeName } from "../theme";
import { StructuralLine } from "../structural/structural-line";
import { shikiLangFor, useShikiTokens } from "../structural/syntax";

/** Per-symbol results shared by the hover preview and the peek panel. */
export interface SymbolData {
  lookup: SymbolLookup | null;
  usages: SymbolUsages | null;
  error: string | null;
}

/** Lines fetched above or below the code pane per "more lines" click. */
const WIDEN_STEP_LINES = 20;
/** Context fetched around a usage, which (unlike a definition) arrives without any. */
const USAGE_CONTEXT_BEFORE = 4;
const USAGE_CONTEXT_AFTER = 16;

/** A source location shown in the peek's code pane, with the lines fetched so far. */
interface PeekTarget {
  path: string;
  line: number | null;
  startLine: number;
  lines: string[];
}

/** Code lines with numbers and Shiki colouring; identifiers stay ⌘-clickable so you can keep drilling down. */
function PeekCode({
  target,
  highlightLine,
  onSymbol,
  onSymbolHover,
  onWiden,
}: {
  target: PeekTarget;
  highlightLine: number | null;
  onSymbol: (symbol: string, anchor: HTMLElement) => void;
  onSymbolHover: (symbol: string | null, anchor: HTMLElement | null) => void;
  onWiden: (direction: "up" | "down") => void;
}) {
  const tokens = useShikiTokens(target.lines.join("\n"), shikiLangFor(target.path), useHostThemeName());
  const widen = (direction: "up" | "down") => (
    <button type="button" className={cn("block w-full bg-sky-500/10 py-px text-center text-[11px] text-sky-700 hover:bg-sky-500/20 dark:text-sky-300", PRESS)} onClick={() => onWiden(direction)}>
      {direction === "up" ? "↑" : "↓"} {WIDEN_STEP_LINES} more lines
    </button>
  );
  return (
    <div className="min-h-0 flex-1 overflow-auto font-mono text-[12px] leading-5">
      {target.startLine > 1 ? widen("up") : null}
      <table className="w-full border-collapse">
        <tbody>
          {target.lines.map((text, index) => {
            const line = target.startLine + index;
            return (
              <tr key={line} className={cn(line === highlightLine && "bg-amber-500/15")}>
                <td className="w-12 select-none pr-2 text-right align-top text-muted-foreground/70">{line}</td>
                <td className="whitespace-pre pl-2 pr-3 align-top">
                  <StructuralLine text={text} changes={null} tokens={tokens?.[index] ?? null} side="RIGHT" onSymbol={onSymbol} onSymbolHover={onSymbolHover} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {widen("down")}
    </div>
  );
}

/**
 * Inline peek under the clicked line, like an editor's "peek definition": a list of definitions or usages on the left,
 * the selected one's source on the right, a trail of symbols you drilled through, and a way out to the full file.
 */
export function SymbolPeek({
  trail,
  data,
  onNavigate,
  onBack,
  onClose,
  onOpenFile,
  onSymbolHover,
}: {
  trail: string[];
  data: SymbolData | undefined;
  onNavigate: (symbol: string) => void;
  onBack: () => void;
  onClose: () => void;
  onOpenFile: (lookup: SymbolLookup, definition: SymbolLookup["definitions"][number]) => void;
  onSymbolHover: (symbol: string | null, anchor: HTMLElement | null) => void;
}) {
  const { source, labels } = useDiffSource();
  const symbol = trail.at(-1)!;
  // Drilling in slides the next symbol in from the right and going back from the left, like a navigation stack; the
  // first symbol only gets the peek's own drop-in.
  const [depth, setDepth] = useState<{ length: number; step: string | null }>({ length: trail.length, step: null });
  if (depth.length !== trail.length) setDepth({ length: trail.length, step: trail.length > depth.length ? enter.slideRight : enter.slideLeft });
  const [tab, setTab] = useState<"definition" | "usages">("definition");
  const [selected, setSelected] = useState(0);
  const [target, setTarget] = useState<PeekTarget | null>(null);
  const definitions = data?.lookup?.definitions ?? [];
  const usages = data?.usages?.usages ?? [];
  // Reset to the first definition whenever the symbol changes.
  useEffect(() => {
    setTab("definition");
    setSelected(0);
    setTarget(null);
  }, [symbol]);
  const items = tab === "definition" ? definitions : usages;
  const current = items[selected] ?? items[0] ?? null;
  // Definitions arrive with context; usages (and widening) fetch a slice on demand.
  useEffect(() => {
    if (current === null) {
      setTarget(null);
      return;
    }
    const context = "context" in current ? current.context : null;
    if (context !== null && context !== undefined) {
      setTarget({ path: current.path, line: current.line, startLine: context.startLine, lines: context.lines });
      return;
    }
    if (current.line === null) {
      setTarget({ path: current.path, line: null, startLine: 1, lines: [current.snippet] });
      return;
    }
    const { path, snippet } = current;
    const line = current.line;
    let cancelled = false;
    source.peekFile(path, Math.max(1, line - USAGE_CONTEXT_BEFORE), line + USAGE_CONTEXT_AFTER).then(
      (slice) => {
        if (!cancelled) setTarget({ path, line, startLine: slice.startLine, lines: slice.lines });
      },
      () => {
        // An unreadable file still shows the grep snippet.
        if (!cancelled) setTarget({ path, line, startLine: line, lines: [snippet] });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [current, source]);
  const widen = (direction: "up" | "down") => {
    if (target === null) return;
    const startLine = direction === "up" ? Math.max(1, target.startLine - WIDEN_STEP_LINES) : target.startLine + target.lines.length;
    const endLine = direction === "up" ? target.startLine - 1 : target.startLine + target.lines.length + WIDEN_STEP_LINES - 1;
    if (endLine < startLine) return;
    source.peekFile(target.path, startLine, endLine).then(
      (slice) => {
        if (slice.lines.length === 0) return;
        setTarget((existing) =>
          existing === null
            ? existing
            : direction === "up"
              ? { ...existing, startLine: slice.startLine, lines: [...slice.lines, ...existing.lines] }
              : { ...existing, lines: [...existing.lines, ...slice.lines] },
        );
      },
      (cause: unknown) => toast.error(errorMessage(cause)),
    );
  };
  const byFile = new Map<string, Array<{ index: number; line: number | null; snippet: string }>>();
  items.forEach((item, index) => {
    const list = byFile.get(item.path) ?? [];
    list.push({ index, line: item.line, snippet: item.snippet });
    byFile.set(item.path, list);
  });
  const openTarget = () => {
    if (data?.lookup === undefined || data.lookup === null || current === null) return;
    onOpenFile(data.lookup, { path: current.path, line: current.line, snippet: current.snippet, context: null });
  };
  return (
    <div className={cn("my-1 flex flex-col overflow-hidden rounded-md border border-sky-500/40 bg-background text-sm shadow-sm", enter.drop, FAST)} role="region" aria-label={`Peek ${symbol}`}>
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-2 py-1 text-xs">
        {trail.length > 1 ? (
          <button type="button" className={cn("rounded px-1 text-muted-foreground hover:bg-state-hover hover:text-foreground", PRESS)} title={`Back to ${trail.at(-2)}`} onClick={onBack}>
            ←
          </button>
        ) : null}
        <code className="font-medium">{symbol}</code>
        <div role="tablist" className="flex rounded border border-border p-px">
          {(["definition", "usages"] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={tab === entry}
              className={cn("rounded px-1.5 py-px", PRESS, tab === entry ? "bg-state-active text-foreground" : "text-muted-foreground hover:text-foreground")}
              onClick={() => {
                setTab(entry);
                setSelected(0);
              }}
            >
              {entry === "definition" ? `Definition${definitions.length > 1 ? ` (${definitions.length})` : ""}` : `Usages${data?.usages ? ` (${usages.length}${data.usages.truncated ? "+" : ""})` : ""}`}
            </button>
          ))}
        </div>
        {data === undefined ? <span className="text-muted-foreground">searching…</span> : null}
        {data?.error ? <span className="text-destructive">{data.error}</span> : null}
        <span className="ml-auto flex items-center gap-1">
          {current !== null ? (
            <button type="button" className={cn("rounded px-1.5 py-px text-muted-foreground hover:bg-state-hover hover:text-foreground", PRESS)} onClick={openTarget}>
              Open file
            </button>
          ) : null}
          <button type="button" aria-label="Close peek" className={cn("rounded p-0.5 text-muted-foreground hover:bg-state-hover hover:text-foreground", PRESS)} onClick={onClose}>
            <Icon name="X" className="size-3.5" />
          </button>
        </span>
      </div>
      <div key={trail.length} className={cn("flex min-h-0 flex-col", depth.step, FAST)}>
        {data !== undefined && items.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {tab === "definition" ? (data.lookup?.searched === "none" ? labels.noCheckout : "No definition found.") : "No usages found."}
          </p>
        ) : (
          <div className="flex max-h-[28rem] min-h-0">
            {items.length > 1 || tab === "usages" ? (
              <ul className="w-2/5 min-w-0 shrink-0 overflow-y-auto border-r border-border text-xs">
                {[...byFile.entries()].map(([path, entries]) => (
                  <li key={path}>
                    <div className="truncate bg-muted/30 px-2 py-0.5 font-mono text-[11px] text-muted-foreground" title={path}>
                      {path}
                    </div>
                    {entries.map((entry) => (
                      <button
                        key={`${path}:${entry.line ?? entry.index}`}
                        type="button"
                        className={cn("flex w-full items-baseline gap-2 px-2 py-0.5 text-left hover:bg-state-hover", entry.index === (items[selected] === undefined ? 0 : selected) && "bg-state-active")}
                        onClick={() => setSelected(entry.index)}
                      >
                        <span className="w-8 shrink-0 text-right font-mono tabular-nums text-muted-foreground">{entry.line ?? ""}</span>
                        <span className="min-w-0 flex-1 truncate font-mono">{entry.snippet}</span>
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col">
              {target !== null ? (
                <>
                  <div className="truncate border-b border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground" title={target.path}>
                    {target.path}
                    {target.line !== null ? `:${target.line}` : ""}
                  </div>
                  <PeekCode target={target} highlightLine={target.line} onSymbol={(next) => onNavigate(next)} onSymbolHover={onSymbolHover} onWiden={widen} />
                </>
              ) : data === undefined ? null : (
                <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
