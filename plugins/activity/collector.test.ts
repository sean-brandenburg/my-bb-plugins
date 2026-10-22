// @vitest-environment jsdom
import { KEY_COMMAND_EVENT, type KeyCommandDetail } from "bb-vim-keys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chordToken, type Collector, controlKey, controlLabel, mountCollector, normalizeRoute, routePlugin } from "./collector";
import type { ActivityEvent } from "./contract";

let sent: ActivityEvent[][];
let collector: Collector | null = null;
let now = 1_000_000;
let route = "/threads/thr_abc123";

const mount = (overrides: Partial<Parameters<typeof mountCollector>[2]> = {}) => {
  collector = mountCollector(document, window, {
    send: async (events) => {
      sent.push(events);
    },
    now: () => now,
    route: () => route,
    flushMs: 60_000,
    ...overrides,
  });
  return collector;
};

const html = (markup: string) => {
  document.body.innerHTML = markup;
};

const click = (element: Element, detail = 1) => {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, detail }));
};

const keydown = (target: Element | Document, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, composed: true, ...init });
  (target instanceof Document ? target.body : target).dispatchEvent(event);
  return event;
};

const announce = (on: Element, detail: Omit<KeyCommandDetail, "plugin"> & { plugin?: string }) => {
  on.dispatchEvent(new CustomEvent<KeyCommandDetail>(KEY_COMMAND_EVENT, { bubbles: true, composed: true, detail: { plugin: undefined, ...detail } }));
};

/** Everything buffered so far, without the route event the mount records. */
const recorded = async () => {
  await collector!.flush();
  return sent.flat().filter((event) => event.kind !== "route");
};

beforeEach(() => {
  sent = [];
  now = 1_000_000;
  route = "/threads/thr_abc123";
  vi.useFakeTimers();
});

afterEach(() => {
  collector?.dispose();
  collector = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("normalizeRoute", () => {
  it("blanks ids and file names and cuts deep paths", () => {
    expect(normalizeRoute("/threads/thr_abc123")).toBe("/threads/*");
    expect(normalizeRoute("/plugins/kanban/board/diff/a1b2c3d4e5")).toBe("/plugins/kanban/board/…");
    expect(normalizeRoute("/plugins/obsidian/vault/work/ideas.md")).toBe("/plugins/obsidian/vault/…");
    expect(normalizeRoute("/settings/keyboard")).toBe("/settings/keyboard");
    expect(normalizeRoute("/")).toBe("/");
    expect(routePlugin("/plugins/kanban/board")).toBe("kanban");
    expect(routePlugin("/threads/thr_1")).toBeNull();
  });
});

describe("chordToken", () => {
  it("writes ⌘ and ⌥ chords, which bb owns, in vim notation", () => {
    const event = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);
    expect(chordToken(event({ key: "k", metaKey: true }))).toBe("<D-k>");
    expect(chordToken(event({ key: "D", metaKey: true, shiftKey: true }))).toBe("<D-S-d>");
    expect(chordToken(event({ key: "ArrowLeft", altKey: true }))).toBe("<A-Left>");
    expect(chordToken(event({ key: "f", metaKey: true, ctrlKey: true }))).toBe("<D-C-f>");
    expect(chordToken(event({ key: "j" }))).toBe("j");
    expect(chordToken(event({ key: "Meta", metaKey: true }))).toBeNull();
  });
});

describe("control names", () => {
  it("names a button by its label, text, or image, and blanks numbers in the key", () => {
    html(`
      <div data-bb-plugin="kanban">
        <button id="a" aria-label="Refresh board">↻</button>
        <button id="b">3 open cards</button>
        <button id="c"><img alt="Settings"></button>
        <button id="d" data-testid="composer-send">Send</button>
      </div>`);
    const by = (id: string) => document.getElementById(id)!;
    expect(controlLabel(by("a"))).toBe("Refresh board");
    expect(controlKey(by("a"))).toBe("Refresh board");
    expect(controlLabel(by("b"))).toBe("3 open cards");
    expect(controlKey(by("b"))).toBe("# open cards");
    expect(controlLabel(by("c"))).toBe("Settings");
    expect(controlKey(by("d"))).toBe("#composer-send");
  });

  it("groups list rows by their list rather than their content, and links by their page", () => {
    html(`
      <nav aria-label="Threads">
        <a id="t1" href="/threads/thr_1">Fix the login bug</a>
        <a id="t2" href="/threads/thr_2">Write the release notes</a>
      </nav>
      <section data-bb-plugin="kanban">
        <h3>In review</h3>
        <ul><li><div id="card" data-nav-row="item" role="button">kanban: Submit review button</div></li></ul>
      </section>
      <div role="listbox" aria-label="Pick a model"><div id="opt" role="option">Opus 5.5</div></div>`);
    const by = (id: string) => document.getElementById(id)!;
    expect(controlKey(by("t1"))).toBe("link /threads/*");
    expect(controlKey(by("t1"))).toBe(controlKey(by("t2")));
    expect(controlLabel(by("t1"))).toBe("Fix the login bug");
    expect(controlKey(by("card"))).toBe("item in In review");
    expect(controlKey(by("opt"))).toBe("option in Pick a model");
  });
});

describe("mountCollector", () => {
  it("records a click on the nearest control, attributed to its plugin and the page", async () => {
    html(`<div data-bb-plugin="kanban"><button aria-label="Refresh board"><svg id="icon"></svg></button></div><p id="prose">text</p>`);
    mount();
    route = "/plugins/kanban/board";
    click(document.getElementById("icon")!);
    click(document.getElementById("prose")!);
    const events = await recorded();
    expect(events).toEqual([{ at: now, kind: "click", plugin: "kanban", route: "/plugins/kanban/board", key: "Refresh board", label: "Refresh board", via: "pointer", count: null }]);
  });

  it("tells a keyboard-made click from a mouse one, and keeps the click rather than its Enter", async () => {
    html(`<button id="go">Go</button>`);
    mount();
    const button = document.getElementById("go")!;
    keydown(button, "Enter");
    click(button, 0);
    now += 10_000;
    window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    click(button, 0);
    const events = await recorded();
    expect(events.map((event) => [event.kind, event.key, event.via])).toEqual([
      ["click", "Go", "keyboard"],
      ["click", "Go", "pointer"],
    ]);
  });

  it("records keys outside text boxes, with ⌘ chords, and nothing typed into one", async () => {
    html(`<div data-bb-plugin="obsidian" id="root" tabindex="-1"></div><input id="box"><div contenteditable="true" id="editor"></div>`);
    mount();
    keydown(document.getElementById("root")!, "j");
    keydown(document, "k", { metaKey: true });
    keydown(document, "Shift", { shiftKey: true });
    keydown(document.getElementById("box")!, "j");
    keydown(document.getElementById("editor")!, "x");
    keydown(document, "j", { repeat: true });
    const events = await recorded();
    expect(events.map((event) => [event.kind, event.key, event.plugin])).toEqual([
      ["key", "j", "obsidian"],
      ["key", "<D-k>", null],
    ]);
  });

  it("forgets a key that a type-to-search box took, since it was text", async () => {
    html(`<input id="search" aria-label="Search settings">`);
    mount();
    const box = document.getElementById("search") as HTMLInputElement;
    // bb's settings page: a letter pressed on the page opens the search box with it.
    window.addEventListener("keydown", (event) => {
      if (event.key.length === 1) box.focus();
    });
    keydown(document, "t");
    await vi.advanceTimersByTimeAsync(0);
    keydown(box, "h");
    box.blur();
    keydown(document, "Escape");
    await vi.advanceTimersByTimeAsync(0);
    const events = await recorded();
    expect(events.map((event) => event.key)).toEqual(["<Esc>"]);
  });

  it("turns a key the library ran as a command into that command, folding in the keys the sequence took", async () => {
    html(`<div data-bb-plugin="grpc-client" id="root" tabindex="-1"></div>`);
    mount();
    const root = document.getElementById("root")!;
    const first = keydown(root, "g");
    const second = keydown(root, "g");
    announce(root, { keys: "gg", count: null, event: second, plugin: "grpc-client" });
    keydown(root, "3");
    const down = keydown(root, "j");
    announce(root, { keys: "j", count: 3, event: down });
    keydown(root, "x");
    const events = await recorded();
    expect(first).toBeDefined();
    expect(events.map((event) => [event.kind, event.key, event.count, event.plugin])).toEqual([
      ["command", "gg", null, "grpc-client"],
      ["command", "j", 3, "grpc-client"],
      ["key", "x", null, "grpc-client"],
    ]);
  });

  it("records a command whose keydown it never saw, from the announcement alone", async () => {
    html(`<div data-bb-plugin="prompt-keys" id="root"></div>`);
    mount();
    announce(document.getElementById("root")!, { keys: "y", count: null, event: new KeyboardEvent("keydown", { key: "y" }), plugin: "prompt-keys" });
    const events = await recorded();
    expect(events).toEqual([{ at: now, kind: "command", plugin: "prompt-keys", route: "/threads/*", key: "y", label: "y", via: null, count: null }]);
  });

  it("notes each page as it changes, once", async () => {
    mount();
    route = "/plugins/kanban/board";
    vi.advanceTimersByTime(1000);
    route = "/plugins/kanban/board/diff/abcdef1234";
    vi.advanceTimersByTime(1000);
    route = "/threads/thr_other";
    window.dispatchEvent(new PopStateEvent("popstate"));
    vi.advanceTimersByTime(1000);
    await collector!.flush();
    expect(sent.flat().map((event) => [event.kind, event.key, event.plugin])).toEqual([
      ["route", "/threads/*", null],
      ["route", "/plugins/kanban/board", "kanban"],
      ["route", "/plugins/kanban/board/…", "kanban"],
      ["route", "/threads/*", null],
    ]);
  });

  it("sends in batches on a timer, keeps a batch the server refused, and caps the buffer", async () => {
    html(`<button id="go">Go</button>`);
    let fail = true;
    const sends: number[] = [];
    mount({
      flushMs: 5000,
      maxBuffer: 3,
      send: async (events) => {
        sends.push(events.length);
        if (fail) throw new Error("down");
        sent.push(events);
      },
    });
    const button = document.getElementById("go")!;
    click(button);
    click(button);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sends).toEqual([3]);
    expect(sent).toEqual([]);
    click(button);
    click(button);
    fail = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(sends).toEqual([3, 3]);
    expect(sent.flat()).toHaveLength(3);
  });
});
