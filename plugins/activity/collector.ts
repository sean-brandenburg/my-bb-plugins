// The sink: one set of window listeners that turns clicks, keys, and page changes anywhere in bb
// into activity events, attributed to the plugin whose root they happened under.
import { isTextEntry, KEY_COMMAND_EVENT, type KeyCommandDetail, keyToken, PRESSABLE, tokenize } from "bb-vim-keys";
import { type ActivityEvent, MAX_TEXT } from "./contract";

export interface CollectorOptions {
  /** Delivers a batch; a rejection keeps the batch for the next flush. */
  send: (events: ActivityEvent[]) => Promise<void>;
  now?: () => number;
  /** How often buffered events go out. */
  flushMs?: number;
  /** Oldest events are dropped past this while `send` keeps failing. */
  maxBuffer?: number;
  route?: () => string;
}

export interface Collector {
  flush(): Promise<void>;
  dispose(): void;
}

const PLUGIN_ROOT = "[data-bb-plugin]";
/** What a click lands on: bb's pressables plus menu, list, and tree items and the rows plugin cursors move over. */
const CONTROL = `${PRESSABLE}, [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="treeitem"], [role="row"], [role="link"], [data-nav-row], label, summary`;
/** Controls whose text is content (a thread's title) rather than a name; they group by the list they sit in. */
const CONTENT_ROLES = new Set(["option", "treeitem", "row"]);
const LIST = '[role="list"], [role="listbox"], [role="tree"], [role="grid"], [role="menu"], [role="tablist"], [role="radiogroup"], [data-nav-group], ul, ol, table, nav, section, aside, main, dialog, [role="dialog"]';
const HEADING = "h1, h2, h3, h4, h5, h6, legend, caption";
const POINTER_CLICK_MS = 500;
/** Segments that are ids or file names, not page names. */
const ID_SEGMENT = /^(?:[a-z]+_[A-Za-z0-9]+|[0-9a-f]{8,}|\d+|.+\.[A-Za-z0-9]{1,5})$/u;
const ROUTE_DEPTH = 3;
/** Longer than any control's name; past it a button's text is the content it shows. */
const NAME_LENGTH = 48;

export function clip(text: string): string {
  const collapsed = text.replace(/\s+/gu, " ").trim();
  return collapsed.length > MAX_TEXT ? `${collapsed.slice(0, MAX_TEXT - 1)}…` : collapsed;
}

/** A thread's file page becomes `/threads/⁎/files/⁎` (with asterisks): ids and file names blanked, cut after three segments. */
export function normalizeRoute(pathname: string): string {
  const segments = pathname.split("/").filter((segment) => segment !== "");
  const kept = segments.slice(0, ROUTE_DEPTH).map((segment) => (ID_SEGMENT.test(segment) ? "*" : decodeURIComponent(segment)));
  if (segments.length > ROUTE_DEPTH) kept.push("…");
  return `/${kept.join("/")}`;
}

/** The plugin whose panel a route shows, from bb's `/plugins/<id>/…` routes. */
export function routePlugin(pathname: string): string | null {
  const match = /^\/plugins\/([^/]+)/u.exec(pathname);
  return match === null ? null : decodeURIComponent(match[1]!);
}

/** `closest` that keeps going out of shadow roots (bb's diff renderer draws lines inside one). */
function closestThrough(start: Element | null, selector: string): Element | null {
  for (let node: Element | null = start; node !== null; ) {
    const found = node.closest(selector);
    if (found !== null) return found;
    const root = node.getRootNode();
    node = root instanceof ShadowRoot ? root.host : null;
  }
  return null;
}

export function pluginOf(element: Element | null): string | null {
  return closestThrough(element, PLUGIN_ROOT)?.getAttribute("data-bb-plugin") ?? null;
}

/** A ⌘ or ⌥ chord, which `keyToken` leaves to bb: `<D-k>`, `<A-S-Left>`, `<D-C-f>`. */
export function chordToken(event: KeyboardEvent): string | null {
  if (!event.metaKey && !event.altKey) return keyToken(event);
  const inner = keyToken({ key: event.key, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: false, metaKey: false, isComposing: event.isComposing });
  if (inner === null) return null;
  const body = inner.startsWith("<") ? inner.slice(1, -1) : inner.length === 1 && inner !== inner.toLowerCase() ? `S-${inner.toLowerCase()}` : inner;
  return `<${event.metaKey ? "D-" : ""}${event.altKey ? "A-" : ""}${body}>`;
}

function ownText(element: Element): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy !== null) {
    const text = labelledBy
      .split(/\s+/u)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ");
    if (text.trim() !== "") return text;
  }
  const text = element.textContent ?? "";
  if (text.trim() !== "") return text;
  const image = element.querySelector("img[alt], svg[aria-label], [aria-label]");
  return image?.getAttribute("alt") ?? image?.getAttribute("aria-label") ?? "";
}

/** How a control reads: its label, else its text, else an image's name, else its tag. */
export function controlLabel(element: Element): string {
  const label = element.getAttribute("aria-label") ?? element.getAttribute("title") ?? ownText(element);
  const text = clip(label);
  return text === "" ? `<${element.tagName.toLowerCase()}>` : text;
}

function containerName(element: Element): string {
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const named = node.getAttribute("aria-label");
    if (named !== null && named.trim() !== "") return clip(named);
    if (node.matches(LIST)) {
      const heading = node.querySelector(HEADING);
      if (heading !== null && (heading.textContent ?? "").trim() !== "") return clip(heading.textContent ?? "");
      const id = node.id || node.getAttribute("data-testid");
      if (id) return id;
    }
  }
  return pluginOf(element) ?? "page";
}

/** Whether the control's text is content that would make every row a different key. */
function isContentItem(element: Element): boolean {
  const role = element.getAttribute("role");
  if (role !== null && CONTENT_ROLES.has(role)) return true;
  if (element.hasAttribute("data-nav-row")) return element.getAttribute("data-nav-row") !== "toolbar";
  return element.closest("li, tr") !== null;
}

/** What groups the same control across clicks: a test id, a link's page, a list's name for its rows, else the label with numbers blanked. */
export function controlKey(element: Element): string {
  const testId = element.getAttribute("data-testid");
  if (testId !== null) return `#${testId}`;
  if (element instanceof HTMLAnchorElement && element.getAttribute("href") !== null) {
    const href = element.getAttribute("href")!;
    if (href.startsWith("/")) return `link ${normalizeRoute(href.split(/[?#]/u)[0]!)}`;
    if (!href.startsWith("#")) return "external link";
  }
  if (isContentItem(element)) {
    const role = element.getAttribute("role");
    const kind = element.getAttribute("data-nav-row") ?? (role !== null && CONTENT_ROLES.has(role) ? role : element.tagName.toLowerCase());
    return `${kind} in ${containerName(element)}`;
  }
  const label = element.getAttribute("aria-label") ?? element.getAttribute("title") ?? ownText(element);
  const text = clip(label.replace(/\d[\d,.]*/gu, "#"));
  // A name is short; a row showing a command bb ran or a message's first line is content.
  if (text === "" || text.length > NAME_LENGTH) return `<${element.tagName.toLowerCase()}> in ${containerName(element)}`;
  return text;
}

function controlOf(target: Element | null, win: Window): Element | null {
  if (target === null) return null;
  const control = closestThrough(target, CONTROL);
  if (control !== null) return control;
  // A React onClick on a plain div: the cursor is the only sign it's a control.
  for (let node: Element | null = target, depth = 0; node !== null && depth < 5; node = node.parentElement, depth++) {
    if (win.getComputedStyle(node).cursor === "pointer") return node;
  }
  return null;
}

function eventTarget(event: Event): Element | null {
  const first = event.composedPath()[0];
  return first instanceof Element ? first : event.target instanceof Element ? event.target : null;
}

export function mountCollector(doc: Document, win: Window, options: CollectorOptions): Collector {
  const now = options.now ?? Date.now;
  const flushMs = options.flushMs ?? 5000;
  const maxBuffer = options.maxBuffer ?? 500;
  const currentRoute = options.route ?? (() => win.location.pathname);

  let buffer: ActivityEvent[] = [];
  let sending = false;
  /** Raw key records that a command announcement may turn out to be. */
  const pendingKeys = new WeakMap<KeyboardEvent, ActivityEvent>();
  let lastKey: { record: ActivityEvent; at: number } | null = null;
  let lastPointerDown = -Infinity;
  let lastRoute = "";

  const push = (record: ActivityEvent) => {
    buffer.push(record);
    if (buffer.length > maxBuffer) buffer.splice(0, buffer.length - maxBuffer);
  };

  const drop = (record: ActivityEvent) => {
    const index = buffer.lastIndexOf(record);
    if (index !== -1) buffer.splice(index, 1);
  };

  const flush = async () => {
    if (sending || buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    sending = true;
    try {
      await options.send(batch);
    } catch {
      buffer = [...batch, ...buffer].slice(-maxBuffer);
    } finally {
      sending = false;
    }
  };

  const route = () => normalizeRoute(currentRoute());

  const onPointerDown = () => {
    lastPointerDown = now();
  };

  const onClick = (event: Event) => {
    const target = eventTarget(event);
    const control = controlOf(target, win);
    if (control === null) return;
    const keyboard = (event as MouseEvent).detail === 0 && now() - lastPointerDown > POINTER_CLICK_MS;
    // Enter or Space on a button fires this click; the click is the record, with how it was made.
    if (keyboard && lastKey !== null && now() - lastKey.at < POINTER_CLICK_MS && (lastKey.record.key === "<CR>" || lastKey.record.key === "<Space>")) drop(lastKey.record);
    push({ at: now(), kind: "click", plugin: pluginOf(control), route: route(), key: controlKey(control), label: controlLabel(control), via: keyboard ? "keyboard" : "pointer", count: null });
  };

  const onKeyDown = (event: Event) => {
    const keydown = event as KeyboardEvent;
    if (keydown.repeat || keydown.isComposing) return;
    const target = eventTarget(keydown);
    if (isTextEntry(target)) return;
    const token = chordToken(keydown);
    if (token === null) return;
    const record: ActivityEvent = { at: now(), kind: "key", plugin: pluginOf(target), route: route(), key: token, label: token, via: null, count: null };
    push(record);
    pendingKeys.set(keydown, record);
    lastKey = { record, at: record.at };
    // A type-to-search box (bb's settings search, a palette) takes a key pressed on the page and
    // then holds focus; that key was text, not a shortcut, so it goes once the box has focus.
    win.setTimeout(() => {
      if (record.kind === "key" && isTextEntry(doc.activeElement)) drop(record);
    }, 0);
  };

  /** The raw keys a sequence or count was typed as, sitting just before `record` in the buffer. */
  const trimSequence = (record: ActivityEvent, keys: string, count: number | null) => {
    const typed = [...(count === null ? [] : [...String(count)]), ...tokenize(keys)];
    let index = buffer.lastIndexOf(record) - 1;
    for (let position = typed.length - 2; position >= 0 && index >= 0; position--, index--) {
      const earlier = buffer[index]!;
      if (earlier.kind !== "key" || earlier.key !== typed[position]) break;
      buffer.splice(index, 1);
    }
  };

  const onCommand = (event: Event) => {
    const { detail } = event as CustomEvent<KeyCommandDetail>;
    if (detail === null || typeof detail !== "object" || typeof detail.keys !== "string") return;
    const plugin = detail.plugin ?? pluginOf(event.target instanceof Element ? event.target : null);
    const pending = detail.event instanceof KeyboardEvent ? pendingKeys.get(detail.event) : undefined;
    const record = pending ?? { at: now(), kind: "command", plugin, route: route(), key: detail.keys, label: detail.keys, via: null, count: detail.count };
    if (pending !== undefined) {
      pending.kind = "command";
      pending.key = detail.keys;
      pending.label = detail.keys;
      pending.count = detail.count;
      if (plugin !== null) pending.plugin = plugin;
    } else push(record);
    trimSequence(record, detail.keys, detail.count);
  };

  const noteRoute = () => {
    const path = currentRoute();
    const normalized = normalizeRoute(path);
    if (normalized === lastRoute) return;
    lastRoute = normalized;
    push({ at: now(), kind: "route", plugin: routePlugin(path), route: normalized, key: normalized, label: normalized, via: null, count: null });
  };

  const onHidden = () => {
    if (doc.visibilityState === "hidden") void flush();
  };

  win.addEventListener("pointerdown", onPointerDown, true);
  win.addEventListener("click", onClick, true);
  win.addEventListener("keydown", onKeyDown, true);
  win.addEventListener(KEY_COMMAND_EVENT, onCommand);
  win.addEventListener("popstate", noteRoute);
  doc.addEventListener("visibilitychange", onHidden);
  win.addEventListener("pagehide", () => void flush());
  const navigation = (win as Window & { navigation?: EventTarget }).navigation;
  const onNavigate = () => void win.setTimeout(noteRoute, 0);
  navigation?.addEventListener("navigatesuccess", onNavigate);
  // Not every route change is a navigation event (bb swaps panels in place), so look now and then.
  const routeTimer = win.setInterval(noteRoute, 1000);
  const flushTimer = win.setInterval(() => void flush(), flushMs);
  noteRoute();

  return {
    flush,
    dispose() {
      win.removeEventListener("pointerdown", onPointerDown, true);
      win.removeEventListener("click", onClick, true);
      win.removeEventListener("keydown", onKeyDown, true);
      win.removeEventListener(KEY_COMMAND_EVENT, onCommand);
      win.removeEventListener("popstate", noteRoute);
      doc.removeEventListener("visibilitychange", onHidden);
      navigation?.removeEventListener("navigatesuccess", onNavigate);
      win.clearInterval(routeTimer);
      win.clearInterval(flushTimer);
      void flush();
    },
  };
}
