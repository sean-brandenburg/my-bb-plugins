// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { installUndoArchiveKey, undoLastArchive } from "./undo-archive.js";

function toast(title: string, { front = true, button = "Undo" } = {}) {
  const item = document.createElement("li");
  item.setAttribute("data-sonner-toast", "");
  item.dataset.front = String(front);
  item.innerHTML = `<div data-testid="app-toast-title">${title}</div><button>${button}</button>`;
  document.body.append(item);
  const undo = item.querySelector("button")!;
  const onClick = vi.fn();
  undo.addEventListener("click", onClick);
  return onClick;
}

function pressU(target: EventTarget = document.body, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "u",
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("undoLastArchive", () => {
  it("clicks Undo on the newest archive toast only", () => {
    const older = toast("Thread Archived", { front: false });
    const newest = toast("Thread Archived");
    expect(undoLastArchive(document)).toBe(true);
    expect(newest).toHaveBeenCalledOnce();
    expect(older).not.toHaveBeenCalled();
  });

  it("ignores other toasts", () => {
    const other = toast("Pinned");
    expect(undoLastArchive(document)).toBe(false);
    expect(other).not.toHaveBeenCalled();
  });
});

describe("installUndoArchiveKey", () => {
  it("undoes on u outside text boxes and stops listening after cleanup", () => {
    const undo = toast("Thread Archived");
    const cleanup = installUndoArchiveKey(document, window);
    expect(pressU().defaultPrevented).toBe(true);
    expect(undo).toHaveBeenCalledOnce();
    cleanup();
    pressU();
    expect(undo).toHaveBeenCalledOnce();
  });

  it("leaves u alone in text boxes, with modifiers, and without a toast", () => {
    const cleanup = installUndoArchiveKey(document, window);
    expect(pressU().defaultPrevented).toBe(false);
    const undo = toast("Thread Archived");
    const input = document.createElement("textarea");
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    document.body.append(input, editor);
    pressU(input);
    pressU(editor);
    pressU(document.body, { metaKey: true });
    pressU(document.body, { ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
    cleanup();
  });

  it("leaves u to an open dialog", () => {
    const undo = toast("Thread Archived");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.dataset.state = "open";
    document.body.append(dialog);
    const cleanup = installUndoArchiveKey(document, window);
    expect(pressU(dialog).defaultPrevented).toBe(false);
    expect(undo).not.toHaveBeenCalled();
    dialog.remove();
    pressU();
    expect(undo).toHaveBeenCalledOnce();
    cleanup();
  });
});
