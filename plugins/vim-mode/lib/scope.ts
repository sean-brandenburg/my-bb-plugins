import { createKeyHandler, type KeyContext } from "./handler.ts";
import type { KeyToken } from "./keys.ts";
import type { Keymap } from "./reader.ts";
import { inWidgetWithin, isShown, isTextEntry, OPEN_DIALOG, OWN_KEYS, overlayOver } from "./targets.ts";

export type { KeyContext } from "./handler.ts";

export interface KeyScopeOptions<C> {
  keymap: Keymap<C> | (() => Keymap<C>);
  /** Runs a command; false leaves the key to the page, as if unbound. */
  onCommand: (command: C, context: KeyContext) => boolean | void;
  /**
   * Escape typed in a text box inside the scope, so it can put the cursor back on the box's row;
   * false leaves it. Without it, text boxes keep every key. With vim-mode this is the second
   * Escape: the first leaves vim's insert mode.
   */
  onTextEscape?: (field: HTMLElement, event: KeyboardEvent) => boolean | void;
  /**
   * Scopes sharing a group share the keys that come from nowhere in particular (focus on the page
   * body): the one last clicked or focused takes them. Without a group, a scope takes them while shown.
   */
  group?: string;
  /** Takes the group's body keys while none has been touched, or the last one is hidden. */
  primary?: boolean;
  /** Elements outside the root whose keys count as the scope's, such as a title bar in another React tree. */
  alsoWithin?: string;
  /** Overlays that turn the keys off while up, unless they hold the root. Defaults to open dialogs. */
  blockedBy?: string;
  counts?: boolean;
  timeoutMs?: number;
  /** Listens before bb and vim-mode, and keeps a key the scope takes from reaching them. */
  capture?: boolean;
  /**
   * Listens on the root itself rather than the window, so the scope hears its keys before any
   * window scope does: a list nested in a bigger surface (a file tree in a diff) takes j and k,
   * and the keys it doesn't bind go on to the surface. Keys from the page body never reach it.
   */
  listenOn?: "window" | "root";
  /**
   * Moves focus onto the root as the scope starts if it is on the page body or something unrelated
   * (bb's sidebar link that opened the page), where the keys would be ignored.
   */
  takeFocus?: boolean;
  /**
   * Sees every key while the root is shown, from anywhere, before the scope checks where it came
   * from: for keys the plugin routes by its own state, such as stepping through its open menu. True takes it.
   */
  intercept?: (event: KeyboardEvent, token: KeyToken) => boolean;
  /** Told the count and keys waiting for the rest of a sequence, and "" when the wait ends. */
  onPending?: (keys: string) => void;
}

interface Member {
  root: HTMLElement;
  primary: boolean;
  alsoWithin: string | undefined;
}

interface Group {
  members: Member[];
  last: HTMLElement | null;
}

const groups = new Map<string, Group>();

function groupOf(name: string): Group {
  let group = groups.get(name);
  if (group === undefined) {
    group = { members: [], last: null };
    groups.set(name, group);
  }
  return group;
}

function owner(group: Group): HTMLElement | null {
  if (isShown(group.last)) return group.last;
  const shown = group.members.filter((member) => isShown(member.root));
  return (shown.find((member) => member.primary) ?? shown[shown.length - 1])?.root ?? null;
}

function withinMember(member: Member, element: Element): boolean {
  return member.root.contains(element) || (member.alsoWithin !== undefined && element.closest(member.alsoWithin) !== null);
}

let anonymous = 0;

/**
 * Vim-style keys for one plugin surface. A key counts when it comes from inside `root` (or from
 * nowhere in particular, when this scope owns those), outside any text box, menu, or listbox, with
 * no dialog over the root, and with no ⌘ or ⌥ held. Enter and Space stay with a button or link
 * that has focus. Returns the function that unbinds it.
 */
export function bindKeyScope<C>(root: HTMLElement, options: KeyScopeOptions<C>): () => void {
  const name = options.group ?? `\u0000scope-${++anonymous}`;
  const group = groupOf(name);
  const member: Member = { root, primary: options.primary === true, alsoWithin: options.alsoWithin };
  group.members.push(member);
  const blockedBy = options.blockedBy ?? OPEN_DIALOG;
  const view = root.ownerDocument.defaultView ?? window;
  const capture = options.capture === true;

  const handler = createKeyHandler<C>({
    keymap: options.keymap,
    onCommand: options.onCommand,
    onTextEscape: options.onTextEscape,
    intercept: options.intercept,
    onPending: options.onPending,
    counts: options.counts,
    timeoutMs: options.timeoutMs,
    stopImmediate: capture,
    self: root,
    active: () => isShown(root),
    accepts: (target) => (target === null ? owner(group) === root : withinMember(member, target)) && (target === null || !inWidgetWithin(target, root)),
    blocked: () => overlayOver(root, blockedBy),
  });

  const claim = () => {
    group.last = root;
  };
  // Before takeFocus, so the focus it moves claims the group's body keys as a click would.
  root.addEventListener("focusin", claim);
  root.addEventListener("pointerdown", claim);

  if (options.takeFocus === true) {
    const active = root.ownerDocument.activeElement;
    const unrelated =
      active === null ||
      active === root.ownerDocument.body ||
      (!group.members.some((other) => withinMember(other, active)) && !isTextEntry(active) && active.closest(OWN_KEYS) === null);
    if (unrelated) root.focus({ preventScroll: true });
  }

  const listener: EventTarget = options.listenOn === "root" ? root : view;
  const onKeyDown = (event: Event) => void handler.handle(event as KeyboardEvent);
  // A click between the keys of a sequence ends it, as moving the cursor does in vim.
  const forget = () => handler.reset();
  listener.addEventListener("keydown", onKeyDown, capture);
  view.addEventListener("pointerdown", forget, true);
  return () => {
    listener.removeEventListener("keydown", onKeyDown, capture);
    view.removeEventListener("pointerdown", forget, true);
    handler.dispose();
    root.removeEventListener("focusin", claim);
    root.removeEventListener("pointerdown", claim);
    group.members.splice(group.members.indexOf(member), 1);
    if (group.last === root) group.last = null;
    if (group.members.length === 0) groups.delete(name);
  };
}
