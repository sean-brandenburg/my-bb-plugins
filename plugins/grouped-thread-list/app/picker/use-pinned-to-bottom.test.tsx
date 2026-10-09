// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { usePinnedToBottom } from "./use-pinned-to-bottom.js";

function Preview({
  threadId,
  children,
}: {
  threadId: string | null;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  usePinnedToBottom(ref, threadId);
  return <div ref={ref}>{children}</div>;
}

function setScrollHeight(element: HTMLElement, height: number) {
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: height,
  });
}

async function nextFrame() {
  await act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

function renderPreview(threadId: string | null = "thr_a") {
  const view = render(
    <Preview threadId={threadId}>
      <div data-testid="scroller" style={{ overflowY: "auto" }}>
        <p>first</p>
      </div>
    </Preview>,
  );
  const scroller = view.getByTestId("scroller");
  setScrollHeight(scroller, 500);
  return { ...view, scroller };
}

afterEach(cleanup);

describe("usePinnedToBottom", () => {
  it("opens on the newest content and follows what streams in", async () => {
    const { scroller } = renderPreview();
    await nextFrame();
    expect(scroller.scrollTop).toBe(500);

    setScrollHeight(scroller, 900);
    act(() => {
      scroller.append(document.createElement("p"));
    });
    await nextFrame();
    expect(scroller.scrollTop).toBe(900);
  });

  it("stops following once the user scrolls", async () => {
    const { scroller } = renderPreview();
    await nextFrame();
    fireEvent.wheel(scroller);
    scroller.scrollTop = 100;

    setScrollHeight(scroller, 900);
    act(() => {
      scroller.append(document.createElement("p"));
    });
    await nextFrame();
    expect(scroller.scrollTop).toBe(100);
  });

  it("follows again for the next thread", async () => {
    const { scroller, rerender } = renderPreview();
    await nextFrame();
    fireEvent.wheel(scroller);
    scroller.scrollTop = 100;

    rerender(
      <Preview threadId="thr_b">
        <div data-testid="scroller" style={{ overflowY: "auto" }}>
          <p>first</p>
        </div>
      </Preview>,
    );
    await nextFrame();
    expect(scroller.scrollTop).toBe(500);
  });
});
