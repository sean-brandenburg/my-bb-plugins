import { displaySequence, type KeyToken, tokenize } from "./keys.ts";

/** Commands by key sequence in vim notation: `j`, `gg`, `<C-d>`, `<Esc>`. */
export type Keymap<C> = Readonly<Record<string, C>>;

/** How long the keys of a sequence may sit apart: vim's `timeoutlen`. */
export const SEQUENCE_TIMEOUT_MS = 1000;

export type KeyRead<C> =
  | { kind: "command"; command: C; keys: string; count: number | null }
  /** Waiting for the rest of a sequence or count; the key should do nothing else. */
  | { kind: "pending"; keys: string }
  | { kind: "none" };

export interface KeyReader<C> {
  read(token: KeyToken, at: number): KeyRead<C>;
  /** The count and keys waiting for the rest of a sequence, for a mode label. */
  readonly pending: string;
  reset(): void;
}

export interface KeyReaderOptions {
  /** Milliseconds; `Infinity` waits for as long as it takes. */
  timeoutMs?: number;
  /** Lets a count lead a command, as in `5j`. `0` starts no count, so it can stay a command. */
  counts?: boolean;
}

/**
 * Turns tokens into commands. A key that can't continue the waiting sequence starts over on its
 * own, so `gx` runs `x`. A sequence that is also the start of a longer one would leave vim
 * waiting for a timeout to tell them apart; `keymapConflicts` rules those out instead.
 */
export function createKeyReader<C>(keymap: Keymap<C>, options: KeyReaderOptions = {}): KeyReader<C> {
  const timeout = options.timeoutMs ?? SEQUENCE_TIMEOUT_MS;
  const commands = new Map<string, C>();
  const prefixes = new Set<string>();
  for (const [sequence, command] of Object.entries(keymap)) {
    const tokens = tokenize(sequence);
    commands.set(tokens.join(""), command);
    for (let length = 1; length < tokens.length; length += 1) prefixes.add(tokens.slice(0, length).join(""));
  }
  let buffer = "";
  let count = "";
  let lastAt: number | null = null;

  const reset = () => {
    buffer = "";
    count = "";
    lastAt = null;
  };

  const read = (token: KeyToken, at: number): KeyRead<C> => {
    if (lastAt !== null && at - lastAt > timeout) reset();
    lastAt = at;
    if (options.counts === true && buffer === "" && (/^[1-9]$/.test(token) || (count !== "" && token === "0"))) {
      count += token;
      return { kind: "pending", keys: count };
    }
    const keys = buffer + token;
    const command = commands.get(keys);
    if (command !== undefined) {
      const counted = count === "" ? null : Number(count);
      reset();
      return { kind: "command", command, keys, count: counted };
    }
    if (prefixes.has(keys)) {
      buffer = keys;
      return { kind: "pending", keys: count + keys };
    }
    const waited = buffer !== "" || count !== "";
    reset();
    return waited ? read(token, at) : { kind: "none" };
  };

  return {
    read,
    get pending() {
      return count + buffer;
    },
    reset,
  };
}

/** Sequences that also start a longer one, each with the longer one; a keymap should have none. */
export function keymapConflicts(keymap: Keymap<unknown>): [string, string][] {
  const sequences = Object.keys(keymap).map(tokenize);
  const conflicts: [string, string][] = [];
  for (const short of sequences) {
    for (const long of sequences) {
      if (long.length > short.length && short.every((token, index) => long[index] === token)) conflicts.push([short.join(""), long.join("")]);
    }
  }
  return conflicts;
}

/** One group of a shortcuts list; keys are shown as written (`gg`, `Ctrl-d`, `⌘↵`). */
export interface KeyHelpSection {
  title: string;
  keys: readonly { keys: readonly string[]; action: string }[];
}

/**
 * Keys a shortcuts list shows that the keymap doesn't bind, leaving out `elsewhere`: keys bb, the
 * browser, or a focused control handles.
 */
export function unboundHelpKeys(sections: readonly KeyHelpSection[], keymap: Keymap<unknown>, elsewhere: Iterable<string> = []): string[] {
  const bound = new Set([...Object.keys(keymap).map(displaySequence), ...elsewhere]);
  return sections.flatMap((section) => section.keys.flatMap(({ keys }) => keys.filter((key) => !bound.has(key))));
}
