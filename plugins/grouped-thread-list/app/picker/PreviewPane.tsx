import { useEffect, useState, type RefObject } from "react";
import { ThreadChat } from "@get-bb/plugin-sdk/app";
import { enter, speed } from "bb-motion";
import { cn } from "@/lib/utils";
import type { PreviewScroll } from "./picker-keymap.js";
import { findTranscriptScroller } from "./use-pinned-to-bottom.js";

// Long enough that holding j doesn't mount a transcript per row.
const PREVIEW_DEBOUNCE_MS = 150;
const PREVIEW_LINE_PX = 40;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

/** The thread to preview, trailing the highlight while the cursor moves. */
export function usePreviewThreadId(threadId: string | null): string | null {
  return useDebouncedValue(threadId, PREVIEW_DEBOUNCE_MS);
}

// ThreadChat owns its scroller, so find it when a key needs it rather than
// holding a ref across its re-renders.
export function scrollPreview(root: HTMLElement | null, scroll: PreviewScroll) {
  if (root === null) return;
  const scroller = findTranscriptScroller(root);
  if (scroller === null) return;
  const page = scroller.clientHeight;
  const by = {
    "line-down": PREVIEW_LINE_PX,
    "line-up": -PREVIEW_LINE_PX,
    "half-down": page / 2,
    "half-up": -page / 2,
    "page-down": page - PREVIEW_LINE_PX,
    "page-up": PREVIEW_LINE_PX - page,
    top: -scroller.scrollHeight,
    bottom: scroller.scrollHeight,
  }[scroll];
  scroller.scrollTop = Math.max(
    0,
    Math.min(scroller.scrollTop + by, scroller.scrollHeight - page),
  );
}

export function PreviewPane({
  containerRef,
  threadId,
  focused,
  onFocus,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  threadId: string;
  focused: boolean;
  onFocus: () => void;
}) {
  return (
    <div
      ref={containerRef}
      aria-label="Thread preview"
      data-picker-preview-thread-id={threadId}
      data-picker-column="preview"
      onMouseDown={onFocus}
      className={cn(
        "relative flex min-w-0 flex-1 flex-col border-l border-border",
        enter.slideRight,
        speed.fast,
      )}
    >
      <ThreadChat
        key={threadId}
        threadId={threadId}
        variant="timeline"
        layout="contained"
        className="min-h-0 flex-1"
      />
      {focused ? (
        // Above the chat: its opaque background hides an inset ring.
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-ring"
        />
      ) : null}
    </div>
  );
}
