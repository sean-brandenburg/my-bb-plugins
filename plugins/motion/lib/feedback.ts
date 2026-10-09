import { useCallback, useEffect, useRef, useState, type AnimationEvent } from "react";
import { POP } from "./classes";

/**
 * True once `value` has differed from what it was on the first render, so an
 * indicator animates when it changes in view, not as its list mounts.
 */
export function useChangedSinceMount<T>(value: T): boolean {
  const [initial] = useState(value);
  const [changed, setChanged] = useState(false);
  const differs = !Object.is(value, initial);
  if (differs && !changed) setChanged(true);
  return changed || differs;
}

/**
 * `POP` each time `value` changes after mount, never on first paint or when it
 * first arrives (from null or undefined, i.e. data loading in). Spread `key`
 * onto the element so a second change mid-pop restarts it; the class is
 * dropped when the pop ends so it doesn't override other animations on the
 * element (a busy pulse).
 */
export function usePopOnChange(value: unknown): {
  key: number;
  className: string | undefined;
  onAnimationEnd: (event: AnimationEvent) => void;
} {
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

/**
 * Replays a one-shot animation class (`NUDGE`, `POP`) on an element without
 * remounting it, so it keeps focus and its value.
 */
export function useReplay(animationClass: string): {
  className: string | undefined;
  play: () => void;
  onAnimationEnd: (event: AnimationEvent) => void;
} {
  const [playing, setPlaying] = useState(false);
  const play = useCallback(() => setPlaying(true), []);
  const onAnimationEnd = useCallback((event: AnimationEvent) => {
    if (event.target === event.currentTarget) setPlaying(false);
  }, []);
  return { className: playing ? animationClass : undefined, play, onAnimationEnd };
}

/** True for a moment after `trigger()`, for confirmations like a copy checkmark. */
export function useFlag(durationMs: number): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const trigger = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    setOn(true);
    timer.current = setTimeout(() => setOn(false), durationMs);
  }, [durationMs]);
  return [on, trigger];
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** For motion driven from script (scroll, FLIP); CSS classes adapt on their own. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(REDUCED_MOTION_QUERY).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}
