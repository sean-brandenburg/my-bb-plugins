import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, expect, test } from "vitest";
import { mountVimMode } from "../src/vim/controller";
import { DEFAULT_OPTIONS } from "../src/vim/options";
import { installLayoutStubs } from "./harness";

installLayoutStubs();
globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)) as never;

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  document.body.replaceChildren();
});

const ROW_HEIGHT = 100;
const VIEWPORT_HEIGHT = 500;

interface ThreadPage {
  viewport: HTMLElement;
  prompt: Editor;
  wheel: number[];
}

/**
 * A thread page with jsdom stand-ins for bb's layout. With `window`, only the
 * rows near the scroll position are rendered, as bb's virtualizer does.
 */
function threadPage(rows: string[], window?: number): ThreadPage {
  const viewport = document.createElement("div");
  viewport.setAttribute("data-page-scroll-viewport", "");
  const list = document.createElement("div");
  list.setAttribute("data-timeline-row-list", "top-level");
  const items = document.createElement("div");
  items.setAttribute("data-timeline-items", "");
  list.append(items);
  let scrollTop = 0;
  const render = () => {
    const first = window === undefined ? 0 : Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 1);
    const last = window === undefined ? rows.length - 1 : Math.min(rows.length - 1, first + window);
    items.replaceChildren(
      ...rows.slice(first, last + 1).map((text, offset) => {
        const index = first + offset;
        const row = document.createElement("div");
        row.setAttribute("data-timeline-row-id", `row-${index}`);
        row.setAttribute("data-index", String(index));
        row.innerHTML = text;
        row.getBoundingClientRect = () => {
          const top = index * ROW_HEIGHT - scrollTop;
          return new DOMRect(0, top, 800, ROW_HEIGHT);
        };
        return row;
      }),
    );
  };
  render();
  Object.defineProperty(viewport, "scrollTop", {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
      render();
    },
  });
  Object.defineProperty(viewport, "scrollHeight", { get: () => rows.length * ROW_HEIGHT + 200 });
  Object.defineProperty(viewport, "clientHeight", { get: () => VIEWPORT_HEIGHT });
  viewport.getBoundingClientRect = () => new DOMRect(0, 0, 800, VIEWPORT_HEIGHT);
  const wheel: number[] = [];
  viewport.addEventListener("wheel", (event) => wheel.push(Math.sign(event.deltaY)));

  const form = document.createElement("form");
  form.setAttribute("data-promptbox", "");
  viewport.append(list, form);
  document.body.append(viewport);
  const prompt = new Editor({ element: form, extensions: [StarterKit], content: "<p>draft</p>" });
  cleanups.push(() => prompt.destroy());
  return { viewport, prompt, wheel };
}

function mount() {
  cleanups.push(mountVimMode(() => DEFAULT_OPTIONS));
}

function press(target: Element, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!check() && Date.now() < deadline) await settle();
}

function badge(): string | null {
  const mode = document.querySelector(".bb-vim-indicator:not([hidden]) .bb-vim-mode");
  return mode?.textContent ?? null;
}

function message(): string {
  return document.querySelector(".bb-vim-bar:not([hidden]) .bb-vim-notification")?.textContent ?? "";
}

async function enterScrollMode(page: ThreadPage): Promise<void> {
  page.prompt.view.dom.focus();
  press(page.prompt.view.dom, "Escape");
  press(page.prompt.view.dom, "Escape");
  await settle();
}

async function search(text: string, prefix = "/"): Promise<void> {
  press(document.body, prefix);
  const input = document.querySelector<HTMLInputElement>(".bb-vim-prompt input")!;
  input.value = text;
  press(input, "Enter");
}

test("a second Escape on a thread page leaves the text box for scroll mode", async () => {
  mount();
  const page = threadPage(["one", "two"]);
  page.prompt.view.dom.focus();
  press(page.prompt.view.dom, "Escape");
  await waitFor(() => badge() === "NORMAL");
  expect(badge()).toBe("NORMAL");
  const second = press(page.prompt.view.dom, "Escape");
  expect(second.defaultPrevented).toBe(false);
  await settle();
  expect(document.activeElement).toBe(document.body);
  expect(badge()).toBe("SCROLL");
});

test("scroll mode keys move the conversation and announce each move to bb", async () => {
  mount();
  const page = threadPage(Array.from({ length: 30 }, (_, index) => `row ${index}`));
  await enterScrollMode(page);
  const reached: string[] = [];
  const outer = (event: KeyboardEvent) => reached.push(event.key);
  document.addEventListener("keydown", outer);

  press(document.body, "j");
  expect(page.viewport.scrollTop).toBe(60);
  press(document.body, "k");
  expect(page.viewport.scrollTop).toBe(0);
  press(document.body, "d", { ctrlKey: true });
  expect(page.viewport.scrollTop).toBe(VIEWPORT_HEIGHT / 2);
  press(document.body, "u", { ctrlKey: true });
  expect(page.viewport.scrollTop).toBe(0);
  press(document.body, "G", { shiftKey: true });
  expect(page.viewport.scrollTop).toBe(30 * ROW_HEIGHT + 200 - VIEWPORT_HEIGHT);
  press(document.body, "g");
  expect(page.viewport.scrollTop).not.toBe(0);
  press(document.body, "g");
  expect(page.viewport.scrollTop).toBe(0);

  document.removeEventListener("keydown", outer);
  expect(reached).toEqual([]);
  expect(page.wheel).toEqual([1, -1, 1, -1, 1, -1]);
});

test("keys scroll mode does not use still reach bb", async () => {
  mount();
  const page = threadPage(["one"]);
  await enterScrollMode(page);
  expect(press(document.body, "x").defaultPrevented).toBe(false);
  expect(press(document.body, "k", { metaKey: true }).defaultPrevented).toBe(false);
  expect(press(document.body, "o", { ctrlKey: true }).defaultPrevented).toBe(false);
  expect(press(document.body, "Escape").defaultPrevented).toBe(false);
  expect(badge()).toBe("SCROLL");
});

test("i goes back to the text box in insert mode", async () => {
  mount();
  const page = threadPage(["one"]);
  await enterScrollMode(page);
  const key = press(document.body, "i");
  expect(key.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(page.prompt.view.dom);
  expect(press(page.prompt.view.dom, "l").defaultPrevented).toBe(false);
  expect(press(document.body, "j").defaultPrevented).toBe(false);
});

test("i goes to the thread's prompt box when the text box that was left is gone", async () => {
  mount();
  const page = threadPage(["one"]);
  const note = document.createElement("textarea");
  note.getBoundingClientRect = () => new DOMRect(0, 0, 200, 40);
  page.viewport.querySelector("[data-timeline-items]")!.append(note);
  note.focus();
  press(note, "Escape");
  press(note, "Escape");
  await settle();
  expect(badge()).toBe("SCROLL");
  note.remove();
  press(document.body, "i");
  expect(document.activeElement).toBe(page.prompt.view.dom);
});

test("focus moving into another text box ends scroll mode", async () => {
  mount();
  const page = threadPage(["one"]);
  await enterScrollMode(page);
  const field = document.createElement("textarea");
  field.getBoundingClientRect = () => new DOMRect(0, 0, 200, 40);
  document.body.append(field);
  field.focus();
  expect(badge()).not.toBe("SCROLL");
  expect(press(field, "j").defaultPrevented).toBe(false);
});

test("focus moving into a part of the page that opted out of vim pauses scroll mode until it leaves", async () => {
  mount();
  const page = threadPage(["one", "two", "three", "four", "five", "six", "seven"]);
  await enterScrollMode(page);
  const banner = document.createElement("section");
  banner.setAttribute("data-vim-ignore", "");
  const choice = document.createElement("button");
  banner.append(choice);
  page.viewport.append(banner);
  choice.focus();
  await waitFor(() => badge() !== "SCROLL");
  expect(badge()).not.toBe("SCROLL");
  expect(press(choice, "j").defaultPrevented).toBe(false);
  expect(page.viewport.scrollTop).toBe(0);
  banner.remove();
  await waitFor(() => badge() === "SCROLL");
  expect(badge()).toBe("SCROLL");
  expect(press(document.body, "j").defaultPrevented).toBe(true);
  expect(page.viewport.scrollTop).toBe(60);
});

test("i goes back to the text box after a popup that took focus closes", async () => {
  mount();
  const page = threadPage(["one"]);
  await enterScrollMode(page);
  const picker = document.createElement("div");
  picker.setAttribute("data-vim-ignore", "");
  picker.tabIndex = -1;
  const search = document.createElement("input");
  picker.append(search);
  document.body.append(picker);
  picker.focus();
  search.focus();
  picker.focus();
  picker.remove();
  await waitFor(() => badge() === "SCROLL");
  expect(badge()).toBe("SCROLL");
  expect(press(document.body, "i").defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(page.prompt.view.dom);
});

test("focus moving to a button outside the conversation pauses scroll mode until it is blurred", async () => {
  mount();
  const page = threadPage(["one", "two", "three", "four", "five", "six", "seven"]);
  await enterScrollMode(page);
  const button = document.createElement("button");
  document.body.prepend(button);
  button.focus();
  await waitFor(() => badge() !== "SCROLL");
  expect(badge()).not.toBe("SCROLL");
  expect(press(button, "j").defaultPrevented).toBe(false);
  button.blur();
  await waitFor(() => badge() === "SCROLL");
  expect(badge()).toBe("SCROLL");
  press(document.body, "j");
  expect(page.viewport.scrollTop).toBe(60);
});

test("/ finds matches in order, n wraps at the bottom, and N goes back", async () => {
  mount();
  const page = threadPage(["alpha", "the needle", "beta", "another <b>nee</b>dle", "gamma"]);
  await enterScrollMode(page);
  await search("needle");
  await waitFor(() => message() === "/needle");
  expect(message()).toBe("/needle");
  press(document.body, "n");
  expect(message()).toBe("");
  await waitFor(() => message() === "/needle");
  expect(message()).toBe("/needle");
  press(document.body, "n");
  await waitFor(() => message() !== "");
  expect(message()).toBe("search hit BOTTOM, continuing at TOP");
  press(document.body, "N", { shiftKey: true });
  await waitFor(() => message() !== "");
  expect(message()).toBe("search hit TOP, continuing at BOTTOM");
});

test("a search with no match reports it and leaves the scroll position alone", async () => {
  mount();
  const page = threadPage(Array.from({ length: 40 }, (_, index) => `row ${index}`), 8);
  await enterScrollMode(page);
  page.viewport.scrollTop = 1000;
  await search("missing");
  await waitFor(() => message().startsWith("E486"));
  expect(message()).toBe("E486: Pattern not found: missing");
  expect(page.viewport.scrollTop).toBe(1000);
});

test("search scrolls to rows the virtualizer has not rendered yet", async () => {
  mount();
  const rows = Array.from({ length: 60 }, (_, index) => (index === 45 ? "the far needle" : `row ${index}`));
  const page = threadPage(rows, 8);
  await enterScrollMode(page);
  expect(page.viewport.querySelector('[data-index="45"]')).toBeNull();
  await search("needle");
  await waitFor(() => !!page.viewport.querySelector('[data-index="45"]') && message() === "/needle");
  expect(page.viewport.querySelector('[data-index="45"]')).not.toBeNull();
  expect(message()).toBe("/needle");
});

test("a key pressed during a long search cancels it", async () => {
  mount();
  const page = threadPage(Array.from({ length: 200 }, (_, index) => `row ${index}`), 8);
  await enterScrollMode(page);
  await search("missing");
  press(document.body, "g");
  press(document.body, "g");
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(page.viewport.scrollTop).toBe(0);
  expect(message()).not.toContain("E486");
});
