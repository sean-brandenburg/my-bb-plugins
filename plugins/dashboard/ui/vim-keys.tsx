// A subset of bb-vim-keys/react (plugins/vim-mode/lib) with the same names and signatures. Once
// that library is on main, depend on it and import these from "bb-vim-keys/react" instead.
import { type ReactNode, type RefObject, useEffect, useRef } from "react";

/** Commands by key sequence in vim notation: `j`, `gg`, `<C-d>`, `<Esc>`. */
export type Keymap<C> = Readonly<Record<string, C>>;
export type KeyToken = string;

export interface KeyContext {
  event: KeyboardEvent;
  /** Where the key came from; null when focus was on the page itself. */
  target: Element | null;
  keys: string;
  count: number | null;
}

export interface KeyScopeOptions<C> {
  keymap: Keymap<C>;
  /** Runs a command; false leaves the key to the page, as if unbound. */
  onCommand: (command: C, context: KeyContext) => boolean | void;
  /** Escape typed in a text box inside the scope; false leaves it. Without it, text boxes keep every key. */
  onTextEscape?: (field: HTMLElement, event: KeyboardEvent) => boolean | void;
  timeoutMs?: number;
}

export interface KeyHelpSection {
  title: string;
  keys: readonly { keys: readonly string[]; action: string }[];
}

export const NAV_ROW = "[data-nav-row]";
export const SEQUENCE_TIMEOUT_MS = 1000;

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn", "FnLock", "Hyper", "Super", "OS", "AltGraph"]);
const NAMED: Readonly<Record<string, string>> = {
  Escape: "Esc",
  Enter: "CR",
  " ": "Space",
  Tab: "Tab",
  Backspace: "BS",
  ArrowDown: "Down",
  ArrowUp: "Up",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

export function keyToken(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "isComposing">): KeyToken | null {
  const { key } = event;
  if (event.isComposing || event.metaKey || event.altKey || MODIFIER_KEYS.has(key) || key === "Dead" || key === "Unidentified" || key === "Process") return null;
  const named = NAMED[key];
  if (named !== undefined) {
    const shift = event.shiftKey && key !== " " ? "S-" : "";
    return `<${event.ctrlKey ? "C-" : ""}${shift}${named}>`;
  }
  if ([...key].length !== 1) return null;
  if (event.ctrlKey) return `<C-${event.shiftKey ? "S-" : ""}${key.toLowerCase()}>`;
  return key;
}

const TOKEN = /<[^<>]+>|[^]/gu;

export function tokenize(sequence: string): KeyToken[] {
  return sequence.match(TOKEN) ?? [];
}

export type KeyRead<C> = { kind: "command"; command: C; keys: string } | { kind: "pending"; keys: string } | { kind: "none" };

/** Turns tokens into commands; a key that can't continue the waiting sequence starts over on its own. */
export function createKeyReader<C>(keymap: Keymap<C>, timeoutMs = SEQUENCE_TIMEOUT_MS) {
  const commands = new Map<string, C>();
  const prefixes = new Set<string>();
  for (const [sequence, command] of Object.entries(keymap)) {
    const tokens = tokenize(sequence);
    commands.set(tokens.join(""), command);
    for (let length = 1; length < tokens.length; length += 1) prefixes.add(tokens.slice(0, length).join(""));
  }
  let buffer = "";
  let lastAt: number | null = null;
  const reset = () => {
    buffer = "";
    lastAt = null;
  };
  const read = (token: KeyToken, at: number): KeyRead<C> => {
    if (lastAt !== null && at - lastAt > timeoutMs) reset();
    lastAt = at;
    const keys = buffer + token;
    const command = commands.get(keys);
    if (command !== undefined) {
      reset();
      return { kind: "command", command, keys };
    }
    if (prefixes.has(keys)) {
      buffer = keys;
      return { kind: "pending", keys };
    }
    const waited = buffer !== "";
    reset();
    return waited ? read(token, at) : { kind: "none" };
  };
  return { read, reset };
}

const TEXT_ENTRY = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable]:not([contenteditable=false])";
const OWN_KEYS = "[role=menu], [role=listbox], [role=combobox], [role=slider], [role=tablist]";
const OPEN_DIALOG = "[role=dialog][data-state=open], [role=alertdialog][data-state=open], dialog[open]";
const PRESSABLE = "button, a[href], [role=button], [role=link], summary";

export function isTextEntry(element: Element): boolean {
  return element.closest(TEXT_ENTRY) !== null;
}

function isShown(element: HTMLElement): boolean {
  return element.isConnected && element.getClientRects().length > 0;
}

/**
 * Vim-style keys for one plugin surface. A key counts when it comes from inside `root` or from
 * nowhere in particular (focus on the page body), outside any text box or menu, with no dialog open
 * over the root and no ⌘ or ⌥ held. Enter and Space stay with a focused button or link.
 */
export function bindKeyScope<C>(root: HTMLElement, options: KeyScopeOptions<C>): () => void {
  const reader = createKeyReader(options.keymap, options.timeoutMs);
  const doc = root.ownerDocument;
  const take = (event: KeyboardEvent) => event.preventDefault();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const token = keyToken(event);
    if (token === null || !isShown(root)) return;
    const raw = event.target instanceof Element ? event.target : null;
    const target = raw === null || raw === doc.body || raw === doc.documentElement ? null : raw;
    if (target !== null && !root.contains(target)) return;
    if (target !== null && target !== root && target.closest(OWN_KEYS) !== null) return;
    if (Array.from(doc.querySelectorAll(OPEN_DIALOG)).some((dialog) => !dialog.contains(root))) return;
    if (target !== null && isTextEntry(target)) {
      if (token !== "<Esc>" || options.onTextEscape === undefined) return;
      const field = target instanceof HTMLElement ? target : root;
      if (options.onTextEscape(field, event) !== false) take(event);
      return;
    }
    if ((token === "<CR>" || token === "<Space>") && target !== null && target.closest(NAV_ROW) === null && target.closest(PRESSABLE) !== null) return;
    const read = reader.read(token, event.timeStamp);
    if (read.kind === "none") return;
    if (read.kind === "pending") {
      take(event);
      return;
    }
    if (options.onCommand(read.command, { event, target, keys: read.keys, count: null }) !== false) take(event);
  };
  const view = doc.defaultView ?? window;
  view.addEventListener("keydown", onKeyDown);
  return () => view.removeEventListener("keydown", onKeyDown);
}

/** `bindKeyScope` while `enabled` holds and the root is mounted; callbacks may change on every render. */
export function useKeyScope<C>(root: HTMLElement | null | RefObject<HTMLElement | null>, enabled: boolean, options: KeyScopeOptions<C>): void {
  const latest = useRef(options);
  latest.current = options;
  const { keymap, timeoutMs } = options;
  const hasTextEscape = options.onTextEscape !== undefined;
  useEffect(() => {
    const node = root !== null && "current" in root ? root.current : root;
    if (!enabled || node === null) return;
    return bindKeyScope(node, {
      keymap,
      timeoutMs,
      onCommand: (command, context) => latest.current.onCommand(command, context),
      onTextEscape: hasTextEscape ? (field, event) => latest.current.onTextEscape?.(field, event) : undefined,
    });
  }, [enabled, root, keymap, timeoutMs, hasTextEscape]);
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={`min-w-6 rounded border border-border bg-muted px-1.5 py-0.5 text-center font-mono text-xs${className === undefined ? "" : ` ${className}`}`}>{children}</kbd>;
}

function KeyList({ keys }: { keys: KeyHelpSection["keys"] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
      {keys.map(({ keys: sequence, action }) => (
        <div key={action} className="contents">
          <dt className="flex gap-1">
            {sequence.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </dt>
          <dd className="text-muted-foreground">{action}</dd>
        </div>
      ))}
    </dl>
  );
}

export function KeyHelp({ sections }: { sections: readonly KeyHelpSection[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{section.title}</h3>
          <KeyList keys={section.keys} />
        </section>
      ))}
    </div>
  );
}
