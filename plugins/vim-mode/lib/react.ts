import { type KeyboardEvent as ReactKeyboardEvent, type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createKeyHandler, type KeyHandlerOptions } from "./handler.ts";
import { createPickerKeys, type PickerKeys, type PickerKeysOptions } from "./picker.ts";
import { bindKeyScope, type KeyScopeOptions } from "./scope.ts";
import { compileSearch, createSearchHighlights, revealRange, type SearchHighlights, textRanges } from "./search.ts";
import { isTextEntry } from "./targets.ts";

export * from "./index.ts";
export { KeyHelp, Kbd, useFocusReturn } from "./help.tsx";

/**
 * `bindKeyScope` for as long as `enabled` holds and the root is mounted. Callbacks may change on
 * every render; the rest of the options rebind the scope when they change, so keep the keymap
 * stable (a module constant). A ref is read after every render, so a root that mounts later than
 * the component (behind a condition) is still picked up.
 */
export function useKeyScope<C>(root: HTMLElement | null | RefObject<HTMLElement | null>, enabled: boolean, options: KeyScopeOptions<C>): void {
  const latest = useRef(options);
  latest.current = options;
  const bound = useRef<{ node: HTMLElement; deps: readonly unknown[]; unbind: () => void } | null>(null);
  const { keymap, group, primary, alsoWithin, blockedBy, counts, timeoutMs, capture, takeFocus } = options;
  const hasTextEscape = options.onTextEscape !== undefined;
  const hasIntercept = options.intercept !== undefined;

  useEffect(() => {
    const node = enabled ? (root !== null && "current" in root ? root.current : root) : null;
    const deps = [keymap, group, primary, alsoWithin, blockedBy, counts, timeoutMs, capture, takeFocus, hasTextEscape, hasIntercept];
    const current = bound.current;
    if (current !== null && current.node === node && current.deps.every((dep, index) => Object.is(dep, deps[index]))) return;
    current?.unbind();
    bound.current = null;
    if (node === null) return;
    const unbind = bindKeyScope(node, {
      keymap,
      group,
      primary,
      alsoWithin,
      blockedBy,
      counts,
      timeoutMs,
      capture,
      takeFocus,
      onCommand: (command, context) => latest.current.onCommand(command, context),
      onTextEscape: hasTextEscape ? (field, event) => latest.current.onTextEscape?.(field, event) : undefined,
      intercept: hasIntercept ? (event, token) => latest.current.intercept?.(event, token) === true : undefined,
      onPending: (keys) => latest.current.onPending?.(keys),
    });
    bound.current = { node, deps, unbind };
  });

  useEffect(
    () => () => {
      bound.current?.unbind();
      bound.current = null;
    },
    [],
  );
}

type AnyKeyboardEvent = KeyboardEvent | ReactKeyboardEvent;

function nativeOf(event: AnyKeyboardEvent): KeyboardEvent {
  return "nativeEvent" in event ? event.nativeEvent : event;
}

/** Hands a React keydown to `handle`; a key it takes stops there, so the surfaces around it don't act on it too. */
function reactKeyDown(handle: (event: KeyboardEvent) => boolean) {
  return (event: AnyKeyboardEvent): boolean => {
    const taken = handle(nativeOf(event));
    if (taken) event.stopPropagation();
    return taken;
  };
}

/**
 * `createKeyHandler` for a React `onKeyDown`: `<div onKeyDown={keys}>`. The handler lives as
 * long as the component and reads the latest options on every key. React runs it before any
 * window scope, so a nested list (a card inside a board) takes its keys first.
 */
export function useKeyHandler<C>(options: KeyHandlerOptions<C>): (event: AnyKeyboardEvent) => boolean {
  const latest = useRef(options);
  latest.current = options;
  const [handler] = useState(() =>
    createKeyHandler<C>({
      keymap: () => {
        const current = latest.current.keymap;
        return typeof current === "function" ? current() : current;
      },
      onCommand: (command, context) => latest.current.onCommand(command, context),
      accepts: (target, event) => latest.current.accepts?.(target, event) ?? true,
      active: () => latest.current.active?.() ?? true,
      blocked: () => latest.current.blocked?.() ?? false,
      isText: (element) => (latest.current.isText ?? isTextEntry)(element),
      onTextEscape: (field, event) => (latest.current.onTextEscape === undefined ? false : latest.current.onTextEscape(field, event)),
      intercept: (event, token) => latest.current.intercept?.(event, token) === true,
      onUnbound: (event, token) => latest.current.onUnbound?.(event, token),
      onPending: (keys) => latest.current.onPending?.(keys),
      get leaveToPressables() {
        return latest.current.leaveToPressables;
      },
      get self() {
        return latest.current.self;
      },
      counts: options.counts,
      timeoutMs: options.timeoutMs,
      stopImmediate: options.stopImmediate,
    }),
  );
  useEffect(() => () => handler.dispose(), [handler]);
  return useMemo(() => reactKeyDown(handler.handle), [handler]);
}

/**
 * `createPickerKeys` for React: `onListKeyDown` goes on the list (or the trigger that keeps focus
 * while it is open) and `onFilterKeyDown` on the filter box. Taken keys stop there. Options are
 * read on every key, so pass them inline.
 */
export function usePickerKeys<C = never>(options: PickerKeysOptions<C>): {
  onListKeyDown: (event: AnyKeyboardEvent) => boolean;
  onFilterKeyDown: (event: AnyKeyboardEvent) => boolean;
  keys: PickerKeys;
} {
  const latest = useRef(options);
  latest.current = options;
  const [keys] = useState(() =>
    createPickerKeys<C>({
      length: () => latest.current.length(),
      highlight: () => latest.current.highlight(),
      setHighlight: (index) => latest.current.setHighlight(index),
      pick: (index, event) => latest.current.pick(index, event),
      pageSize: () => latest.current.pageSize?.() ?? 10,
      get wrap() {
        return latest.current.wrap;
      },
      ...(options.openFilter === undefined ? {} : { openFilter: () => latest.current.openFilter?.() }),
      onListEscape: () => latest.current.onListEscape?.() ?? false,
      onFilterEscape: () => latest.current.onFilterEscape?.() ?? false,
      ...(options.keymap === undefined ? {} : { keymap: options.keymap }),
      onCommand: (command, context) => latest.current.onCommand?.(command, context),
    }),
  );
  return useMemo(() => ({ onListKeyDown: reactKeyDown(keys.list), onFilterKeyDown: reactKeyDown(keys.filter), keys }), [keys]);
}

export interface TextSearch {
  open: boolean;
  query: string;
  /** How many matches, and which is current (-1 for none). */
  count: number;
  current: number;
  /** `/`: opens the box; cancelling scrolls back to here, and the first match is the next one down. */
  start(): void;
  setQuery(query: string): void;
  /** Enter in the box: keep the matches and close it. */
  commit(): void;
  /** Escape in the box: drop the search and scroll back to where it started. */
  cancel(): void;
  /** n and N; false with no matches. */
  next(step: 1 | -1, count?: number | null): boolean;
  /** Escape in the pane, like `:nohlsearch`; false when there was no search. */
  clear(): boolean;
}

/**
 * Vim's `/` over a scrolling pane's text: matches highlight as the query is typed (smartcase,
 * `\<` `\>`, regex), the view jumps to the first at or below where the search started, and
 * n/N step through them, wrapping. `content` changes whenever the pane shows something else, so
 * the matches are found again. Pair it with `createSearchBoxKeys` on the box.
 */
export function useTextSearch(scroller: () => HTMLElement | null, content: unknown, options: { name?: string; style?: { match: string; current: string } } = {}): TextSearch {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(-1);
  const [count, setCount] = useState(0);
  const ranges = useRef<Range[]>([]);
  const origin = useRef(0);
  const highlights = useRef<SearchHighlights | null>(null);
  const paint = (index: number) => {
    const pane = scroller();
    if (pane === null) return;
    highlights.current ??= createSearchHighlights(pane.ownerDocument, options.name ?? "bb-vim-search", options.style);
    highlights.current.show(ranges.current, index);
    const range = ranges.current[index];
    if (range !== undefined) revealRange(pane, range);
  };
  const latestPaint = useRef(paint);
  latestPaint.current = paint;

  useLayoutEffect(() => {
    const pane = scroller();
    const pattern = compileSearch(query);
    if (pane === null || pattern === null) {
      ranges.current = [];
      setCount(0);
      setCurrent(-1);
      highlights.current?.show([], -1);
      return;
    }
    const found = textRanges(pane, pattern);
    ranges.current = found;
    setCount(found.length);
    const paneTop = pane.getBoundingClientRect().top - pane.scrollTop;
    const below = found.findIndex((range) => range.getBoundingClientRect().top - paneTop >= origin.current);
    const index = found.length === 0 ? -1 : below === -1 ? 0 : below;
    setCurrent(index);
    latestPaint.current(index);
  }, [query, content, scroller]);

  useEffect(
    () => () => {
      highlights.current?.clear();
      highlights.current = null;
    },
    [],
  );

  return {
    open,
    query,
    count,
    current,
    start: () => {
      origin.current = scroller()?.scrollTop ?? 0;
      setOpen(true);
    },
    setQuery,
    commit: () => setOpen(false),
    cancel: () => {
      setOpen(false);
      setQuery("");
      const pane = scroller();
      if (pane !== null) pane.scrollTop = origin.current;
    },
    next: (step, times = 1) => {
      const total = ranges.current.length;
      if (total === 0) return false;
      const index = (((current + step * (times ?? 1)) % total) + total) % total;
      setCurrent(index);
      paint(index);
      return true;
    },
    clear: () => {
      if (query === "") return false;
      setQuery("");
      return true;
    },
  };
}
