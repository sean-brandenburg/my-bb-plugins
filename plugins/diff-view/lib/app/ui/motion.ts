import { useState, type CSSProperties } from "react";

// Class names from bb-motion's motion.css, which the host plugin imports (diff-view's app.tsx, kanban's). This library
// is bundled by other plugins, so a bare `bb-motion` import here would resolve from the wrong node_modules.
export const enter = {
  fade: "bbm-fade-in",
  rise: "bbm-rise-in",
  drop: "bbm-drop-in",
  slideLeft: "bbm-slide-in-left",
  slideRight: "bbm-slide-in-right",
  scale: "bbm-scale-in",
  pop: "bbm-pop-in",
} as const;

export const FAST = "bbm-fast";
export const STAGGER = "bbm-stagger";
export const PRESS = "bbm-press";
export const CHEVRON = "bbm-chevron";
export const TRANSFORM_TRANSITION = "bbm-transform";
export const OPACITY_TRANSITION = "bbm-opacity";
export const POP = "bbm-pop";
export const SHIMMER = "bbm-shimmer";

// Dense lists change highlight on every arrow key and mouse sweep; any fade there reads as lag.
export const LIST_HOVER_TRANSITION = "transition-none";

/** Matches motion.css's --bbm-stagger-cap: items past it all enter at once, with the last delay. */
export const STAGGER_CAP = 10;

/** Inline style for one item of a staggered list: pair with `STAGGER`. */
export function stagger(index: number): CSSProperties {
  return { "--bbm-index": index } as CSSProperties;
}

/**
 * True once `open` has turned on after the first render, and from then on. Disclosure bodies use it so they rise in
 * when the reader opens them, not when the whole view (or a lazily mounted file) mounts already open.
 */
export function useOpenedSinceMount(open: boolean): boolean {
  const [state, setState] = useState({ open, opened: false });
  if (state.open === open) return state.opened;
  const next = { open, opened: state.opened || open };
  setState(next);
  return next.opened;
}
