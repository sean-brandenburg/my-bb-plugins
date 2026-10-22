import { useEffect, useRef } from "react";
import { STICKY_HEADER_PX, revealBox, type RevealBlock } from "../scroll";
import { rowIndexOf, type Cursor } from "./nav";
import type { ReviewKeys } from "./review-keys-context";

/** How often, and how many times, a reveal waits for a line that is not laid out yet. */
const RETRY_MS = 100;
const RETRIES = 20;

/**
 * Scrolls the keyboard cursor into view in whichever scroller currently shows the diff (the files view's, or the
 * narrative's), found through `scroller` and `sectionFor` at call time so one hook serves both modes. A cursor sent
 * to a line that is not laid out yet (a file still mounting or loading, Pierre filling its shadow DOM a beat late) is
 * scrolled to once it is.
 */
export function useCursorReveal(keys: ReviewKeys, scroller: () => HTMLElement | null, sectionFor: (path: string) => Element | null, stickyHeaders: () => boolean) {
  const elementFor = (cursor: Cursor): Element | null => {
    if (cursor.line === null) return sectionFor(cursor.path);
    const model = keys.models.get(cursor.path);
    const row = model === undefined ? -1 : rowIndexOf(model.rows, cursor.side, cursor.line);
    return row === -1 ? null : model!.element(row, cursor.side);
  };
  const pending = useRef<{ cursor: Cursor; block: RevealBlock | undefined; tries: number } | null>(null);
  const reveal = (cursor: Cursor, block?: RevealBlock) => {
    const main = scroller();
    if (main === null) return;
    if (cursor.line === null) {
      // A stuck header reports where it sticks, not where it sits; the section's top is where it sits.
      const section = sectionFor(cursor.path);
      pending.current = null;
      if (section !== null) revealBox(main, { top: section.getBoundingClientRect().top, height: stickyHeaders() ? STICKY_HEADER_PX : section.getBoundingClientRect().height }, block);
      return;
    }
    const element = elementFor(cursor);
    if (element === null) {
      pending.current = { cursor, block, tries: 0 };
      sectionFor(cursor.path)?.scrollIntoView({ block: "start" });
      return;
    }
    pending.current = null;
    const box = element.getBoundingClientRect();
    revealBox(main, { top: box.top, height: box.height }, block);
  };
  const latest = useRef({ reveal, elementFor });
  latest.current = { reveal, elementFor };
  useEffect(() => {
    let timer = 0;
    const retry = () => {
      const waiting = pending.current;
      if (waiting === null || keys.get().cursor !== waiting.cursor) return;
      if (latest.current.elementFor(waiting.cursor) !== null) latest.current.reveal(waiting.cursor, waiting.block);
      else if (++waiting.tries < RETRIES) timer = window.setTimeout(retry, RETRY_MS);
    };
    const unsubscribe = keys.onModel((path) => {
      if (pending.current?.cursor.path !== path) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(retry, 0);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [keys]);
  /** Whether the cursor's line is on screen; null when it is not rendered at all. */
  const onScreen = (cursor: Cursor): boolean | null => {
    const main = scroller();
    const element = elementFor(cursor);
    if (main === null || element === null) return null;
    const view = main.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return box.bottom > view.top + (cursor.line === null || !stickyHeaders() ? 0 : STICKY_HEADER_PX) && box.top < view.bottom;
  };
  return { reveal, elementFor, onScreen };
}
