import type { VimScope } from "./options";

/** A viewport rectangle. */
export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** A selection as text offsets; `anchor` stays put while `head` moves. */
export interface TextRange {
  anchor: number;
  head: number;
}

/**
 * The editing surface the vim adapter drives. Offsets index the host's plain
 * text, in which every line break (of any underlying kind) is one `\n`.
 */
export interface TextHost {
  /** The focusable element that receives keyboard input. */
  readonly element: HTMLElement;
  /** Cheap identity that changes whenever the text may have changed. */
  docKey(): unknown;
  text(): string;
  selection(): TextRange;
  setSelection(anchor: number, head: number): void;
  replace(from: number, to: number, insert: string): void;
  /**
   * True when `undo`/`redo` step the host's own history; otherwise the
   * adapter restores text itself.
   */
  readonly nativeHistory: boolean;
  /** Returns false when the host has nothing to undo/redo. */
  undo(): boolean;
  redo(): boolean;
  /** Keeps the next change out of the host history group of earlier changes. */
  closeHistoryGroup?(): void;
  /**
   * True while the editor shows its own completion popup, which then gets
   * Enter, Tab, the arrows, and Escape instead of vim.
   */
  completionOpen?(): boolean;
  isEditable(): boolean;
  focus(): void;
  /** Viewport rectangle of the character starting at `offset`. */
  coordsAt(offset: number): Rect | null;
  /** Offset nearest to a viewport point. */
  offsetAt(x: number, y: number): number | null;
  /** Viewport position of the content's top-left corner (moves with scrolling). */
  contentOrigin(): { left: number; top: number };
  scrollElement(): HTMLElement;
  scrollIntoView(offset: number): void;
  lineHeight(): number;
  /** Calls `listener` synchronously after any text or selection change. */
  subscribe(listener: () => void): () => void;
  destroy(): void;
}

/** A provider's answer for a focused element it recognizes. */
export type Claim = { element: HTMLElement } | { skip: string };

export const UNSUPPORTED: { skip: string } = { skip: "not a supported text box" };

/**
 * Finds and builds one kind of `TextHost`. Supporting a new kind of text box
 * means implementing this next to its host and listing it in the controller.
 */
export interface HostProvider<Editor = unknown> {
  /** Names the kind in attach logs. */
  readonly kind: string;
  /**
   * Null when `target` is not part of this kind of editor, so the next
   * provider is asked. Otherwise the element vim attaches to, or why it
   * cannot (for the log).
   */
  claim(target: HTMLElement, scope: VimScope): Claim | null;
  /** The live editor behind a claimed element; a different one means bb remounted it. */
  editorFor(element: HTMLElement): Editor | null;
  create(element: HTMLElement, editor: Editor): TextHost;
}
