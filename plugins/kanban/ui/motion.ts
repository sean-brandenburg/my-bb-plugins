// Kanban-side motion helpers built on bb-motion's classes. Candidates for bb-motion itself; they live
// here until the shared library grows them.
import { useCallback, useEffect, useReducer, useRef, useState, type AnimationEvent } from "react";
import { POP } from "bb-motion";

// Matches --bbm-duration-exit plus bb-motion's presence grace period.
const EXIT_FALLBACK_MS = 140 + 80;

/**
 * How a keyed item came to be on screen. `intro` items were there on the first render with data
 * (cascade them in), `new` ones arrived later (a single entrance), and `null` ones were already seen,
 * so a remount (a card dragged to another column) plays nothing. Pass `null` keys while loading;
 * it also resets, so the next load cascades again.
 */
export type Arrival = "intro" | "new" | null;

export function useArrivals(keys: readonly string[] | null): (key: string) => Arrival {
  const seen = useRef<Set<string> | null>(null);
  const loaded = keys !== null;
  const signature = keys?.join("\u0000") ?? null;
  useEffect(() => {
    if (keys === null) {
      seen.current = null;
      return;
    }
    const next = seen.current ?? new Set<string>();
    for (const key of keys) next.add(key);
    seen.current = next;
    // `signature` stands in for `keys`, which callers usually rebuild every render.
  }, [signature]);
  const known = seen.current;
  return (key) => (!loaded ? null : known === null ? "intro" : known.has(key) ? null : "new");
}

/**
 * Holds an entrance class from mount until its animation ends. Dropping it afterwards keeps it from
 * replaying when the element comes back from `display: none` or when another animation class on the
 * same element (a pop) comes and goes.
 */
export function useEntrance(initial: string | undefined): { className: string | undefined; onAnimationEnd: (event: AnimationEvent) => void } {
  const [className, setClassName] = useState(initial);
  const onAnimationEnd = useCallback((event: AnimationEvent) => {
    if (event.target === event.currentTarget) setClassName(undefined);
  }, []);
  return { className, onAnimationEnd };
}

/**
 * `POP` each time `value` changes after mount, never on first paint or when it first arrives (from null
 * or undefined, i.e. data loading in). Spread `key` onto the element so a
 * second change mid-pop restarts it; the class is dropped when the pop ends so it doesn't override
 * other animations on the element (a busy pulse).
 */
export function usePopOnChange(value: unknown): { key: number; className: string | undefined; onAnimationEnd: (event: AnimationEvent) => void } {
  const [previous, setPrevious] = useState(value);
  const [pops, setPops] = useState(0);
  const [popping, setPopping] = useState(false);
  if (!Object.is(previous, value)) {
    setPrevious(value);
    if (previous !== null && previous !== undefined) {
      setPops(pops + 1);
      setPopping(true);
    }
  }
  const onAnimationEnd = useCallback((event: AnimationEvent) => {
    if (event.target === event.currentTarget) setPopping(false);
  }, []);
  return { key: pops, className: popping ? POP : undefined, onAnimationEnd };
}

export type PresenceEntry<T> = { key: string; item: T; exiting: boolean };

/**
 * `usePresence` for a keyed list: a removed item stays where it was, flagged `exiting`, until its exit
 * animation ends (call `onExited(key)` from its `onAnimationEnd`) or a fallback timer fires.
 */
export function usePresenceList<T>(items: readonly T[], keyOf: (item: T) => string): { entries: PresenceEntry<T>[]; onExited: (key: string) => void } {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const rendered = useRef<PresenceEntry<T>[]>([]);
  const dismissed = useRef(new Set<string>());
  const live = new Set(items.map(keyOf));
  const entries: PresenceEntry<T>[] = items.map((item) => ({ key: keyOf(item), item, exiting: false }));
  rendered.current.forEach((entry, index) => {
    if (live.has(entry.key) || dismissed.current.has(entry.key)) return;
    entries.splice(Math.min(index, entries.length), 0, { key: entry.key, item: entry.item, exiting: true });
  });
  rendered.current = entries;
  dismissed.current.clear();

  const onExited = useCallback((key: string) => {
    if (!rendered.current.some((entry) => entry.key === key && entry.exiting)) return;
    dismissed.current.add(key);
    rerender();
  }, []);
  const exitingKeys = entries.filter((entry) => entry.exiting).map((entry) => entry.key);
  const exitingSignature = exitingKeys.join("\u0000");
  useEffect(() => {
    if (exitingSignature === "") return;
    const timer = setTimeout(() => {
      for (const key of exitingSignature.split("\u0000")) dismissed.current.add(key);
      rerender();
    }, EXIT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [exitingSignature]);
  return { entries, onExited };
}
