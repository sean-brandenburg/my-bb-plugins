import { useCallback, useEffect, useReducer, useRef, useState, type AnimationEvent } from "react";

// Matches --bbm-duration-exit; the fallback timer waits this long past it when
// no animationend arrives (reduced motion, display: none).
const EXIT_MS = 140;
const EXIT_GRACE_MS = 80;

export type Presence = {
  /** Render the element while true. */
  mounted: boolean;
  /** True from the moment `present` turns false until unmount: apply an exit class. */
  exiting: boolean;
  /** Attach to the exiting element so the unmount follows its animation. */
  onAnimationEnd: (event: AnimationEvent) => void;
};

/**
 * Keeps an element mounted long enough to play an exit animation.
 *
 *   const p = usePresence(open);
 *   {p.mounted && <div className={p.exiting ? exit.sink : enter.rise} onAnimationEnd={p.onAnimationEnd} />}
 */
export function usePresence(present: boolean, exitMs: number = EXIT_MS): Presence {
  const [mounted, setMounted] = useState(present);
  const exitingRef = useRef(false);
  const exiting = mounted && !present;
  exitingRef.current = exiting;

  useEffect(() => {
    if (present) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), exitMs + EXIT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [present, exitMs]);

  const onAnimationEnd = useCallback((event: AnimationEvent) => {
    if (event.target === event.currentTarget && exitingRef.current) setMounted(false);
  }, []);

  return { mounted: mounted || present, exiting, onAnimationEnd };
}

export type PresenceEntry<T> = { key: string; item: T; exiting: boolean };

/**
 * `usePresence` for a keyed list: a removed item stays where it was, flagged
 * `exiting`, until its exit animation ends (call `onExited(key)` from its
 * `onAnimationEnd`) or a fallback timer fires.
 */
export function usePresenceList<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): { entries: PresenceEntry<T>[]; onExited: (key: string) => void } {
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
  const exitingSignature = entries
    .filter((entry) => entry.exiting)
    .map((entry) => entry.key)
    .join("\u0000");
  useEffect(() => {
    if (exitingSignature === "") return;
    const timer = setTimeout(() => {
      for (const key of exitingSignature.split("\u0000")) dismissed.current.add(key);
      rerender();
    }, EXIT_MS + EXIT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [exitingSignature]);
  return { entries, onExited };
}

/**
 * Stable keys for a list stored as bare values. Index keys would make removing
 * item 2 unmount the last row instead, so its exit would play on the wrong
 * one. Call `forget(index)` just before removing that item from the data.
 */
export function useListKeys(length: number): { keys: readonly number[]; forget: (index: number) => void } {
  const next = useRef(0);
  const keys = useRef<number[]>([]);
  while (keys.current.length < length) keys.current.push(next.current++);
  keys.current.length = length;
  return {
    keys: keys.current,
    forget: (index) => {
      keys.current.splice(index, 1);
    },
  };
}
