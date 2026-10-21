// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MINIMAL_TOP_BAR_CSS,
  mountMinimalTopBar,
  TITLE_CLICK_DELAY_MS,
} from "./top-bar.js";

const nextFrame = () =>
  new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("mountMinimalTopBar", () => {
  it("hides the Commit button and removes everything it added on cleanup", async () => {
    document.body.innerHTML = `
      <div data-thread-header-workflow-actions>
        <div id="commit" data-thread-header-responsive-action><button>Commit</button></div>
        <div id="other" data-thread-header-responsive-action><button>Review</button></div>
      </div>`;
    const cleanup = mountMinimalTopBar(document, window);
    expect(document.querySelectorAll("style[data-minimal-top-bar]")).toHaveLength(
      1,
    );
    await nextFrame();
    const commit = document.getElementById("commit")!;
    expect(commit.hasAttribute("data-minimal-top-bar-hidden")).toBe(true);
    expect(
      document.getElementById("other")!.hasAttribute("data-minimal-top-bar-hidden"),
    ).toBe(false);

    cleanup();

    expect(document.querySelectorAll("style[data-minimal-top-bar]")).toHaveLength(
      0,
    );
    expect(commit.hasAttribute("data-minimal-top-bar-hidden")).toBe(false);
  });

  it("hides a Commit button that bb renders later", async () => {
    document.body.innerHTML = `<div id="actions" data-thread-header-workflow-actions></div>`;
    const cleanup = mountMinimalTopBar(document, window);
    await nextFrame();

    document.getElementById("actions")!.innerHTML =
      `<div id="commit" data-thread-header-responsive-action><button>Commit</button></div>`;
    await nextFrame();
    await nextFrame();

    expect(
      document.getElementById("commit")!.hasAttribute("data-minimal-top-bar-hidden"),
    ).toBe(true);
    cleanup();
  });

  it("hides bb's sidebar toggle", () => {
    document.body.innerHTML = `<button id="toggle" data-sidebar="trigger"></button><button id="back"></button>`;
    const cleanup = mountMinimalTopBar(document, window);
    expect(getComputedStyle(document.getElementById("toggle")!).display).toBe("none");
    expect(getComputedStyle(document.getElementById("back")!).display).not.toBe("none");
    cleanup();
  });

  it("applies at every window width", () => {
    // bb's compact layout brings back the ⋯ and close buttons, so the restyle can't be limited to wide windows.
    expect(MINIMAL_TOP_BAR_CSS).not.toContain("@media");
  });
});

describe("title menu", () => {
  function renderTitle() {
    document.body.innerHTML = `
      <div data-testid="app-page-header-content-row">
        <p><span class="bb-thread-title">A thread</span></p>
        <span><button aria-label="Thread actions"></button></span>
      </div>`;
    const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Thread actions"]')!;
    const opened = vi.fn(() => trigger.setAttribute("aria-expanded", "true"));
    const clicked = vi.fn();
    trigger.addEventListener("pointerdown", opened);
    trigger.addEventListener("click", clicked);
    return {
      title: document.querySelector<HTMLElement>(".bb-thread-title")!,
      trigger,
      opened,
      clicked,
    };
  }

  it("opens the thread menu on a single click of the title", () => {
    vi.useFakeTimers();
    const { title, opened } = renderTitle();
    const cleanup = mountMinimalTopBar(document, window);

    title.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(opened).not.toHaveBeenCalled();
    vi.advanceTimersByTime(TITLE_CLICK_DELAY_MS);
    expect(opened).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("doesn't also click a dropdown that opened on pointerdown", () => {
    vi.useFakeTimers();
    const { title, clicked } = renderTitle();
    const cleanup = mountMinimalTopBar(document, window);

    title.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    vi.advanceTimersByTime(TITLE_CLICK_DELAY_MS);
    expect(clicked).not.toHaveBeenCalled();

    cleanup();
  });

  it("clicks the trigger when pointerdown doesn't open a menu, as bb's compact sheet needs", () => {
    vi.useFakeTimers();
    const { title, trigger, opened, clicked } = renderTitle();
    trigger.removeEventListener("pointerdown", opened);
    const cleanup = mountMinimalTopBar(document, window);

    title.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    vi.advanceTimersByTime(TITLE_CLICK_DELAY_MS);
    expect(clicked).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("leaves a double-click to bb's rename", () => {
    vi.useFakeTimers();
    const { title, opened } = renderTitle();
    const cleanup = mountMinimalTopBar(document, window);

    title.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    title.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
    title.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    vi.advanceTimersByTime(TITLE_CLICK_DELAY_MS);
    expect(opened).not.toHaveBeenCalled();

    cleanup();
  });

  it("stays closed when bb's rename opens before the delay is up", () => {
    vi.useFakeTimers();
    const { title, opened } = renderTitle();
    const cleanup = mountMinimalTopBar(document, window);

    title.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    title.closest("p")!.append(document.createElement("input"));
    vi.advanceTimersByTime(TITLE_CLICK_DELAY_MS);
    expect(opened).not.toHaveBeenCalled();

    cleanup();
  });

  it("stops listening on cleanup", () => {
    vi.useFakeTimers();
    const { title, opened } = renderTitle();
    mountMinimalTopBar(document, window)();

    title.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    vi.advanceTimersByTime(TITLE_CLICK_DELAY_MS);
    expect(opened).not.toHaveBeenCalled();
  });
});

describe("title press feedback", () => {
  it("eases only the title's transform, with bb-motion's tokens", () => {
    const rule = (selectorEnd: string) =>
      MINIMAL_TOP_BAR_CSS.match(
        new RegExp(`${selectorEnd.replace(/[.:]/g, "\\$&")} \\{([^}]*)\\}`),
      )?.[1];
    expect(rule(".bb-thread-title")).toContain(
      "transition: transform var(--bbm-duration-fast) var(--bbm-ease-out);",
    );
    expect(rule(".bb-thread-title:active")).toContain(
      "transform: scale(calc((1 + var(--bbm-scale-press)) / 2));",
    );
  });
});
