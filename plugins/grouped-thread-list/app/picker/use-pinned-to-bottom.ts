import { useCallback, useEffect, useRef, type RefObject } from "react";

const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll"]);
const SCROLL_KEYS = new Set(["PageUp", "PageDown", "Home", "End", " "]);

/**
 * The transcript's own scroller, found by style rather than by overflow so it
 * is picked before the conversation is long enough to scroll. Requiring most
 * of the container's height skips tool-output and code blocks that scroll on
 * their own.
 */
export function findTranscriptScroller(container: HTMLElement): HTMLElement | null {
  const minHeight = container.clientHeight / 2;
  for (const element of [
    container,
    ...container.querySelectorAll<HTMLElement>("*"),
  ]) {
    if (
      SCROLLABLE_OVERFLOW.has(getComputedStyle(element).overflowY) &&
      element.clientHeight >= minHeight
    ) {
      return element;
    }
  }
  return null;
}

/**
 * bb's timeline-only ThreadChat opens at the oldest loaded message, so this
 * keeps it on the newest one, through loading and streaming, until the user
 * scrolls it themselves. Keys handled outside the container never reach it, so
 * whoever scrolls on their behalf calls the returned function first; otherwise
 * the next scroll event would snap the transcript back to the bottom.
 */
export function usePinnedToBottom(
  containerRef: RefObject<HTMLElement | null>,
  resetKey: string | null,
): () => void {
  const releaseRef = useRef<() => void>(() => {});
  useEffect(() => {
    const container = containerRef.current;
    if (container === null || resetKey === null) return;
    let scroller: HTMLElement | null = null;
    let released = false;
    let frame = 0;

    const pin = () => {
      frame = 0;
      if (released) return;
      if (scroller === null || !scroller.isConnected) {
        scroller = findTranscriptScroller(container);
      }
      if (scroller !== null) scroller.scrollTop = scroller.scrollHeight;
    };
    const schedule = () => {
      if (!released && frame === 0) frame = requestAnimationFrame(pin);
    };
    const release = () => {
      released = true;
    };
    releaseRef.current = release;
    // A press on the scroller itself (not its content) is a scrollbar drag.
    const onPointerDown = (event: PointerEvent) => {
      if (event.target === scroller) release();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) release();
    };

    const mutations = new MutationObserver(schedule);
    mutations.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const resizes =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    resizes?.observe(container);
    container.addEventListener("wheel", release, { passive: true });
    container.addEventListener("touchmove", release, { passive: true });
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("keydown", onKeyDown);
    // Scroll doesn't bubble; capturing it catches the timeline jumping on its
    // own (wheel releases before the user's scroll event arrives).
    container.addEventListener("scroll", schedule, true);
    schedule();

    return () => {
      releaseRef.current = () => {};
      if (frame !== 0) cancelAnimationFrame(frame);
      mutations.disconnect();
      resizes?.disconnect();
      container.removeEventListener("wheel", release);
      container.removeEventListener("touchmove", release);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("scroll", schedule, true);
    };
  }, [containerRef, resetKey]);
  return useCallback(() => releaseRef.current(), []);
}
