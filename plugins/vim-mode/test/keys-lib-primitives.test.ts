import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindKeys,
  bindKeyScope,
  compileSearch,
  createKeyHandler,
  createMenuKeys,
  createPickerKeys,
  createSearchBoxKeys,
  keymapConflicts,
  listAction,
  mapKeymap,
  matchOffsets,
  MOTION_KEYS,
  type NavRow,
  renderKeyHelp,
  returnToRow,
  scrollPane,
  spatialStep,
  stepIndex,
  stepMenu,
  textRanges,
  unboundHelpKeys,
} from "../lib/index.ts";

function key(name: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init });
}

function press(target: EventTarget, name: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = key(name, init);
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
    return (this.closest("[hidden]") === null ? [new DOMRect(0, 0, 10, 10)] : []) as unknown as DOMRectList;
  });
  Element.prototype.scrollIntoView = () => {};
});

const unbinds: (() => void)[] = [];
afterEach(() => {
  for (const unbind of unbinds.splice(0)) unbind();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

describe("createKeyHandler", () => {
  it("reads sequences from whatever element it is handed keys on", () => {
    const seen: string[] = [];
    const handler = createKeyHandler({ keymap: { gg: "top", j: "down" }, onCommand: (command) => void seen.push(command) });
    const list = mount(`<div tabindex="-1"></div>`).firstElementChild!;
    list.addEventListener("keydown", (event) => handler.handle(event as KeyboardEvent));
    expect(press(list, "g").defaultPrevented).toBe(true);
    press(list, "g");
    press(list, "j");
    expect(seen).toEqual(["top", "down"]);
  });

  it("picks its keymap by state, dropping a sequence half typed in the other", () => {
    let mode: "list" | "preview" = "list";
    const maps = { list: { gg: "top" }, preview: { gg: "start", "<C-e>": "line" } } as const;
    const seen: string[] = [];
    const handler = createKeyHandler<string>({ keymap: () => maps[mode], onCommand: (command) => void seen.push(command) });
    const root = mount(`<div tabindex="-1"></div>`).firstElementChild!;
    root.addEventListener("keydown", (event) => handler.handle(event as KeyboardEvent));
    press(root, "g");
    mode = "preview";
    press(root, "g");
    expect(seen).toEqual([]);
    press(root, "g");
    expect(seen).toEqual(["start"]);
  });

  it("takes keys from a text box when told it isn't one, and leaves typing alone", () => {
    const seen: string[] = [];
    const handler = createKeyHandler({ keymap: { "<CR>": "pick", "<C-n>": "down" }, isText: () => false, leaveToPressables: false, onCommand: (command) => void seen.push(command) });
    const input = mount(`<input />`).querySelector("input")!;
    input.addEventListener("keydown", (event) => handler.handle(event as KeyboardEvent));
    expect(press(input, "j").defaultPrevented).toBe(false);
    press(input, "n", { ctrlKey: true });
    press(input, "Enter");
    expect(seen).toEqual(["down", "pick"]);
  });

  it("checks accepts, blocked and active, and reports unbound keys", () => {
    let open = true;
    const unbound: string[] = [];
    const seen: string[] = [];
    const host = mount(`<section id="banner"><button id="choice">a</button></section><p id="elsewhere" tabindex="-1"></p>`);
    unbinds.push(
      bindKeys(window, {
        keymap: { j: "down", "<CR>": "pick" },
        capture: true,
        leaveToPressables: false,
        active: () => open,
        accepts: (target) => target?.closest("#banner") != null,
        onUnbound: (_event, token) => void unbound.push(token),
        onCommand: (command) => void seen.push(command),
      }),
    );
    const choice = host.querySelector("#choice")!;
    press(choice, "Enter");
    press(host.querySelector("#elsewhere")!, "j");
    press(choice, "x");
    open = false;
    press(choice, "j");
    expect(seen).toEqual(["pick"]);
    expect(unbound).toEqual(["x"]);
  });

  it("keeps a taken key from later listeners in capture", () => {
    const later = vi.fn();
    unbinds.push(bindKeys(window, { keymap: { j: "down" }, capture: true, onCommand: () => {} }));
    window.addEventListener("keydown", later, true);
    press(document.body, "j");
    press(document.body, "x");
    window.removeEventListener("keydown", later, true);
    expect(later).toHaveBeenCalledTimes(1);
  });

  it("forgets a half-typed sequence on a click", () => {
    const seen: string[] = [];
    unbinds.push(bindKeys(window, { keymap: { gg: "top" }, onCommand: (command) => void seen.push(command) }));
    press(document.body, "g");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    press(document.body, "g");
    expect(seen).toEqual([]);
  });
});

describe("bindKeyScope listening on its root", () => {
  it("hears a nested list's keys before the surface around it, which gets the rest", () => {
    const host = mount(`<div id="outer" tabindex="-1"><ul id="tree" tabindex="-1"><li tabindex="-1" id="row"></li></ul></div>`);
    const outer: string[] = [];
    const inner: string[] = [];
    unbinds.push(bindKeyScope(host.querySelector<HTMLElement>("#outer")!, { keymap: { j: "outer-down", "?": "help" }, onCommand: (command) => void outer.push(command) }));
    unbinds.push(bindKeyScope(host.querySelector<HTMLElement>("#tree")!, { keymap: { j: "tree-down" }, listenOn: "root", onCommand: (command) => void inner.push(command) }));
    const row = host.querySelector("#row")!;
    press(row, "j");
    press(row, "?");
    expect(inner).toEqual(["tree-down"]);
    expect(outer).toEqual(["help"]);
  });
});

describe("stepIndex and motions", () => {
  it("moves by rows, half pages and pages, with counts, clamped", () => {
    expect(stepIndex(10, 2, "down")).toBe(3);
    expect(stepIndex(10, 2, "down", { count: 5 })).toBe(7);
    expect(stepIndex(10, 2, "up", { count: 5 })).toBe(0);
    expect(stepIndex(10, 0, "halfDown", { pageSize: 6 })).toBe(3);
    expect(stepIndex(10, 0, "pageDown", { pageSize: 6 })).toBe(6);
    expect(stepIndex(10, 9, "pageDown", { pageSize: 6 })).toBe(9);
    expect(stepIndex(10, 4, "top", { count: 3 })).toBe(2);
    expect(stepIndex(10, 4, "bottom")).toBe(9);
    expect(stepIndex(0, null, "down")).toBeNull();
  });

  it("lands from no cursor on the end it moves from, and wraps when asked", () => {
    expect(stepIndex(4, null, "down")).toBe(0);
    expect(stepIndex(4, null, "up")).toBe(3);
    expect(stepIndex(4, 3, "down", { wrap: true })).toBe(0);
    expect(stepIndex(4, 0, "up", { wrap: true })).toBe(3);
  });

  it("wraps a keymap's commands and has no sequence that waits on another", () => {
    const keymap = mapKeymap(MOTION_KEYS, (motion) => ({ kind: "move", motion }));
    expect(keymap.gg).toEqual({ kind: "move", motion: "top" });
    expect(keymapConflicts(keymap)).toEqual([]);
  });

  it("gives counts to list motions over rows", () => {
    const rows: NavRow[] = Array.from({ length: 6 }, () => ({ kind: "item", parent: null }));
    expect(listAction(rows, 0, "down", 0, 3)).toEqual({ kind: "focus", index: 3 });
    expect(listAction(rows, 5, "top", 0, 2)).toEqual({ kind: "focus", index: 1 });
    expect(listAction(rows, 0, "bottom", 0, 9)).toEqual({ kind: "focus", index: 5 });
  });

  it("scrolls a pane by lines, pages, and to its ends", () => {
    const pane = mount(`<div></div>`).firstElementChild as HTMLElement;
    Object.defineProperties(pane, { clientHeight: { value: 200 }, scrollHeight: { value: 1000 } });
    const moves: number[] = [];
    const scrollBy = (_pane: HTMLElement, top: number) => void moves.push(top);
    scrollPane(pane, "down", { scrollBy, line: 20, count: 3 });
    scrollPane(pane, "halfUp", { scrollBy });
    scrollPane(pane, "bottom", { scrollBy });
    expect(moves).toEqual([60, -100, 800]);
  });
});

describe("createPickerKeys", () => {
  function picker(options: Partial<Parameters<typeof createPickerKeys<string>>[0]> = {}) {
    const state = { highlight: 0 as number | null, picked: [] as number[], log: [] as string[] };
    const keys = createPickerKeys<string>({
      length: () => 5,
      highlight: () => state.highlight,
      setHighlight: (index) => void (state.highlight = index),
      pick: (index) => void state.picked.push(index),
      openFilter: () => void state.log.push("filter"),
      ...options,
    });
    const host = mount(`<div role="listbox" tabindex="-1"></div><input />`);
    const list = host.querySelector("[role=listbox]")!;
    const input = host.querySelector("input")!;
    list.addEventListener("keydown", (event) => keys.list(event as KeyboardEvent));
    input.addEventListener("keydown", (event) => keys.filter(event as KeyboardEvent));
    return { state, keys, list, input };
  }

  it("moves the highlight with vim keys in the list and picks on Enter", () => {
    const { state, list } = picker();
    press(list, "j");
    press(list, "j");
    expect(state.highlight).toBe(2);
    press(list, "G");
    expect(state.highlight).toBe(4);
    press(list, "g");
    press(list, "g");
    expect(state.highlight).toBe(0);
    press(list, "3");
    press(list, "j");
    expect(state.highlight).toBe(3);
    press(list, "Enter");
    expect(state.picked).toEqual([3]);
  });

  it("opens the filter from the list, and in the box moves only on arrows and Ctrl-n/p", () => {
    const { state, list, input } = picker();
    press(list, "/");
    expect(state.log).toEqual(["filter"]);
    expect(press(input, "j").defaultPrevented).toBe(false);
    press(input, "n", { ctrlKey: true });
    press(input, "ArrowDown");
    expect(state.highlight).toBe(2);
    press(input, "Enter");
    expect(state.picked).toEqual([2]);
  });

  it("leaves Escape to the popover unless a callback takes it", () => {
    const left = picker();
    expect(press(left.list, "Escape").defaultPrevented).toBe(false);
    const handled = picker({ onFilterEscape: () => true });
    expect(press(handled.input, "Escape").defaultPrevented).toBe(true);
  });

  it("adds the surface's own keys, and lists the keymaps for its tests", () => {
    const own: string[] = [];
    const { list, keys } = picker({ keymap: { p: "pin", dd: "archive" }, onCommand: (command) => void own.push(command) });
    press(list, "p");
    press(list, "d");
    press(list, "d");
    expect(own).toEqual(["pin", "archive"]);
    expect(keymapConflicts(keys.keymaps.list)).toEqual([]);
  });
});

describe("search", () => {
  it("compiles smartcase patterns with vim's word boundaries, literally when they don't parse", () => {
    expect(compileSearch("")).toBeNull();
    expect(compileSearch("foo")!.flags).toContain("i");
    expect(compileSearch("Foo")!.flags).not.toContain("i");
    expect(matchOffsets("cat concat", compileSearch("\\<cat\\>")!)).toEqual([[0, 3]]);
    expect(matchOffsets("a(b", compileSearch("a(")!)).toEqual([[0, 2]]);
    expect(matchOffsets("a.b", compileSearch("a.", { regex: false })!)).toEqual([[0, 2]]);
  });

  it("finds ranges across element boundaries", () => {
    const root = mount(`<pre><span>"na</span><span>me": 1</span></pre>`);
    const ranges = textRanges(root, compileSearch("name")!);
    expect(ranges.map((range) => range.toString())).toEqual(["name"]);
  });

  it("keys a search box: Enter commits, Escape cancels, Ctrl-n steps", () => {
    const log: string[] = [];
    const keys = createSearchBoxKeys({ commit: () => void log.push("commit"), cancel: () => void log.push("cancel"), step: (step) => void log.push(`step ${step}`) });
    const input = mount(`<input />`).querySelector("input")!;
    input.addEventListener("keydown", (event) => keys.handle(event as KeyboardEvent));
    expect(press(input, "n").defaultPrevented).toBe(false);
    press(input, "n", { ctrlKey: true });
    press(input, "Enter");
    press(input, "Escape");
    expect(log).toEqual(["step 1", "commit", "cancel"]);
  });
});

describe("menus, spatial steps, help and rows", () => {
  it("steps through a menu's items, claiming j and k before typeahead", () => {
    const menu = mount(`<div role="menu"><div role="menuitem" tabindex="-1">a</div><div role="menuitem" data-disabled tabindex="-1">b</div><div role="menuitem" tabindex="-1">c</div></div>`).firstElementChild!;
    const keys = createMenuKeys();
    menu.addEventListener("keydown", (event) => keys.handle(event as KeyboardEvent));
    press(menu, "j");
    expect(document.activeElement?.textContent).toBe("a");
    expect(press(document.activeElement!, "j").defaultPrevented).toBe(true);
    expect(document.activeElement?.textContent).toBe("c");
    expect(stepMenu(menu, "first")).toBe(true);
    expect(document.activeElement?.textContent).toBe("a");
  });

  it("walks boxes in two dimensions", () => {
    const boxes = [
      { top: 0, bottom: 10, left: 0, right: 50 },
      { top: 0, bottom: 10, left: 60, right: 100 },
      { top: 20, bottom: 30, left: 70, right: 90 },
    ];
    expect(spatialStep(boxes, 0, "right")).toBe(1);
    expect(spatialStep(boxes, 0, "down")).toBe(2);
    expect(spatialStep(boxes, 2, "up")).toBe(1);
    expect(spatialStep(boxes, 2, "down")).toBeNull();
  });

  it("renders a shortcuts list as DOM and checks it against several keymaps", () => {
    const sections = [{ title: "Move", keys: [{ keys: ["j", "Ctrl-d"], action: "Down" }] }, { title: "", keys: [{ keys: ["?"], action: "Keys" }] }];
    const element = document.createElement("div");
    element.append(renderKeyHelp(document, sections));
    expect(element.querySelectorAll("[data-key-help-row]").length).toBe(2);
    expect(element.querySelector("[data-key-help-title]")?.textContent).toBe("Move");
    expect(unboundHelpKeys(sections, [{ j: 1, "<C-d>": 2 }, { "?": 3 }])).toEqual([]);
    expect(unboundHelpKeys(sections, { j: 1 })).toEqual(["Ctrl-d", "?"]);
  });

  it("puts the cursor back on a text box's row after Escape", () => {
    const host = mount(`<div data-nav-row="field" tabindex="-1"><input /></div><button id="fallback"></button>`);
    expect(returnToRow(host.querySelector("input")!)).toBe(true);
    expect(document.activeElement).toBe(host.querySelector("[data-nav-row]"));
    const loose = mount(`<input />`).querySelector("input")!;
    expect(returnToRow(loose, host.querySelector<HTMLElement>("#fallback"))).toBe(true);
    expect(document.activeElement?.id).toBe("fallback");
  });
});
