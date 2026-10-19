import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../format";
import type { DiffSource } from "../source";
import type { SymbolData } from "./symbol-peek";

/** How long ⌘ must rest on an identifier before its hover card appears. */
const HOVER_CARD_DELAY_MS = 350;

/** The open peek: the row it sits under and the symbols drilled through to get here, latest last. */
export interface PeekState {
  rowIndex: number;
  trail: string[];
}

/**
 * ⌘-hover cards and ⌘-click peeks over one file's code. Identifiers are links only while ⌘/Ctrl is held, like an IDE;
 * the peek opens under the clicked identifier's `tr[data-row]`.
 */
export function useSymbolNavigation(source: DiffSource) {
  const [symbolMode, setSymbolMode] = useState(false);
  const [peek, setPeek] = useState<PeekState | null>(null);
  const [hover, setHover] = useState<{ symbol: string; anchor: DOMRect } | null>(null);
  const symbolCache = useRef(new Map<string, SymbolData>());
  const [, bumpSymbols] = useState(0);
  const hoverTimer = useRef<number | null>(null);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "Meta" || event.key === "Control") setSymbolMode(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "Meta" || event.key === "Control") setSymbolMode(false);
    };
    const blur = () => setSymbolMode(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  // Definitions and usages are fetched once per symbol and shared by the hover card and the peek.
  const ensureSymbol = (symbol: string) => {
    if (symbolCache.current.has(symbol)) return;
    Promise.all([source.symbolDefinitions(symbol), source.symbolUsages(symbol)]).then(
      ([lookup, usages]) => {
        symbolCache.current.set(symbol, { lookup, usages, error: null });
        bumpSymbols((n) => n + 1);
      },
      (cause: unknown) => {
        symbolCache.current.set(symbol, { lookup: null, usages: null, error: errorMessage(cause) });
        bumpSymbols((n) => n + 1);
      },
    );
  };
  /** ⌘-click: open (or re-target) the peek under the clicked line. */
  const lookupSymbol = (symbol: string, anchor: HTMLElement) => {
    const rowAttr = anchor.closest("tr[data-row]")?.getAttribute("data-row");
    const rowIndex = rowAttr === null || rowAttr === undefined ? (peek?.rowIndex ?? null) : Number.parseInt(rowAttr, 10);
    if (rowIndex === null) return;
    setHover(null);
    ensureSymbol(symbol);
    setPeek((current) => (current !== null && current.rowIndex === rowIndex ? { rowIndex, trail: [...current.trail, symbol] } : { rowIndex, trail: [symbol] }));
  };
  /** ⌘-hover: a definition preview after a short pause; leaving the identifier or releasing ⌘ hides it. */
  const hoverSymbol = (symbol: string | null, anchor: HTMLElement | null) => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    if (symbol === null || anchor === null || !symbolMode) {
      setHover(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    hoverTimer.current = window.setTimeout(() => {
      ensureSymbol(symbol);
      setHover({ symbol, anchor: rect });
    }, HOVER_CARD_DELAY_MS);
  };
  useEffect(() => {
    if (!symbolMode) setHover(null);
  }, [symbolMode]);
  return {
    symbolMode,
    peek,
    hover: symbolMode ? hover : null,
    symbolData: (symbol: string): SymbolData | undefined => symbolCache.current.get(symbol),
    lookupSymbol,
    hoverSymbol,
    drillInto: (symbol: string) => {
      if (peek === null) return;
      ensureSymbol(symbol);
      setPeek({ rowIndex: peek.rowIndex, trail: [...peek.trail, symbol] });
    },
    back: () => setPeek(peek !== null && peek.trail.length > 1 ? { rowIndex: peek.rowIndex, trail: peek.trail.slice(0, -1) } : null),
    closePeek: () => setPeek(null),
  };
}
