import type { CSSProperties } from "react";

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
  check: "bbm-check-in",
} as const;

export const exit = {
  fade: "bbm-fade-out",
  scale: "bbm-scale-out",
  sink: "bbm-sink-out",
} as const;

export const speed = {
  fast: "bbm-fast",
  slow: "bbm-slow",
} as const;

export const STAGGER = "bbm-stagger";
/** Matches motion.css's --bbm-stagger-cap: items past it enter together, with the last delay. */
export const STAGGER_CAP = 10;
export const NEAR = "bbm-near";
export const DELAYED = "bbm-delayed";
export const PRESS = "bbm-press";
/** Add to `PRESS` on full-width rows, which visibly squeeze at the normal depth. */
export const SOFT = "bbm-soft";
export const LIFT = "bbm-lift";
export const REVEAL = "bbm-reveal";
export const REVEAL_HOST = "bbm-reveal-host";
export const CHEVRON = "bbm-chevron";
export const CHEVRON_FLIP = "bbm-chevron-flip";
export const TRANSFORM_TRANSITION = "bbm-transform";
export const OPACITY_TRANSITION = "bbm-opacity";
export const POP = "bbm-pop";
export const NUDGE = "bbm-nudge";
export const SHIMMER = "bbm-shimmer";

// Dense lists change highlight on every arrow key and mouse sweep; any fade
// there reads as lag.
export const LIST_HOVER_TRANSITION = "transition-none";

/**
 * tw-animate classes for a radix menu or popover that ships without any;
 * motion.css supplies the curve and the trigger-relative origin.
 */
export const POPOVER_MOTION =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1";

/** Inline style for one item of a staggered list: pair with `STAGGER`. */
export function stagger(index: number): CSSProperties {
  return { "--bbm-index": index } as CSSProperties;
}

export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

/**
 * Restarts a one-shot animation class (`POP`, `NUDGE`) on a DOM element, for
 * content scripts that can't remount through a React key.
 */
export function replay(element: HTMLElement, className: string): void {
  element.classList.remove(className);
  // Reading layout commits the removal, so re-adding starts the animation over.
  void element.offsetWidth;
  element.classList.add(className);
}
