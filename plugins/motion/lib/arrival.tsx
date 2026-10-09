import { createContext, useCallback, useContext, useEffect, useRef, useState, type AnimationEvent, type ReactNode, type RefObject } from "react";

/**
 * How a keyed item came to be on screen. `intro` items were there on the first
 * render with data (cascade them in), `new` ones arrived later (a single
 * entrance), and `null` ones were already seen, so a remount (a card dragged
 * to another column) plays nothing.
 */
export type Arrival = "intro" | "new" | null;

/**
 * Sorts keyed items by `Arrival`. Pass `null` keys while loading; that also
 * resets, so the next load cascades again (a reopened dialog).
 */
export function useArrivals(keys: readonly string[] | null): (key: string) => Arrival {
  const seen = useRef<Set<string> | null>(null);
  const loaded = keys !== null;
  const signature = keys?.join("\u0000") ?? null;
  useEffect(() => {
    if (keys === null) {
      seen.current = null;
      return;
    }
    // A fresh set, so the classifier a render already returned keeps answering from that render's view.
    const next = new Set(seen.current);
    for (const key of keys) next.add(key);
    seen.current = next;
    // `signature` stands in for `keys`, which callers usually rebuild every render.
  }, [signature]);
  const known = seen.current;
  return (key) => (!loaded ? null : known === null ? "intro" : known.has(key) ? null : "new");
}

/**
 * Holds an entrance class from mount until its animation ends. Dropping it
 * afterwards keeps it from replaying when the element comes back from
 * `display: none`, or when another animation class on the same element (a pop)
 * comes and goes.
 */
export function useEntrance(initial: string | undefined): {
  className: string | undefined;
  onAnimationEnd: (event: AnimationEvent) => void;
} {
  const [className, setClassName] = useState(initial);
  const onAnimationEnd = useCallback((event: AnimationEvent) => {
    if (event.target === event.currentTarget) setClassName(undefined);
  }, []);
  return { className, onAnimationEnd };
}

const SettledContext = createContext<RefObject<boolean>>({ current: true });

/**
 * Elements rendered in this subtree's first commit ride whatever entrance the
 * subtree itself plays; ones that mount later (an added row, an opened
 * section) play their own. Without this, nested entrances stack and things
 * deep in a freshly shown form travel twice as far.
 */
export function EntranceScope({ children }: { children: ReactNode }) {
  const settled = useRef(false);
  useEffect(() => {
    settled.current = true;
  }, []);
  return <SettledContext.Provider value={settled}>{children}</SettledContext.Provider>;
}

/** True when this component mounted after its `EntranceScope`'s first commit, i.e. in response to the user. */
export function useLateMount(): boolean {
  const settled = useContext(SettledContext);
  const [late] = useState(() => settled.current);
  return late;
}
