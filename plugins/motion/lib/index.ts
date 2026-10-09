import { useCallback, useEffect, useRef, useState, type AnimationEvent, type CSSProperties } from "react";

// Class names from motion.css. A consuming plugin must import
// "bb-motion/motion.css" once (its app.tsx) for these to do anything.
export const enter = {
  fade: "bbm-fade-in",
  rise: "bbm-rise-in",
  drop: "bbm-drop-in",
  slideLeft: "bbm-slide-in-left",
  slideRight: "bbm-slide-in-right",
  scale: "bbm-scale-in",
  pop: "bbm-pop-in",
} as const;

export const exit = {
  fade: "bbm-fade-out",
  sink: "bbm-sink-out",
} as const;

export const speed = {
  fast: "bbm-fast",
  slow: "bbm-slow",
} as const;

export const STAGGER = "bbm-stagger";
export const PRESS = "bbm-press";
export const LIFT = "bbm-lift";
export const REVEAL = "bbm-reveal";
export const REVEAL_HOST = "bbm-reveal-host";
export const CHEVRON = "bbm-chevron";
export const TRANSFORM_TRANSITION = "bbm-transform";
export const OPACITY_TRANSITION = "bbm-opacity";
export const POP = "bbm-pop";
export const NUDGE = "bbm-nudge";
export const SHIMMER = "bbm-shimmer";

// Dense lists change highlight on every arrow key and mouse sweep; any fade
// there reads as lag.
export const LIST_HOVER_TRANSITION = "transition-none";

// Matches --bbm-duration-exit; the presence fallback timer waits this long
// past it when no animationend arrives (reduced motion, display: none).
const EXIT_MS = 140;
const EXIT_GRACE_MS = 80;

/** Inline style for one item of a staggered list: pair with `STAGGER`. */
export function stagger(index: number): CSSProperties {
  return { "--bbm-index": index } as CSSProperties;
}

export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

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
