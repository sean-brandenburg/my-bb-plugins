import { afterEach, expect, test } from "vitest";
import { Vim, VimEditor } from "../src/vim/adapter";
import { handleVimKey } from "../src/vim/keys";
import { isErrorMessage, VimUi } from "../src/vim/ui";
import { createHost, installLayoutStubs } from "./harness";

installLayoutStubs();
globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)) as never;

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  document.body.replaceChildren();
});

function setup(text: string) {
  const host = createHost("textarea", document.body, text);
  // jsdom has no text layout; a fixed-pitch grid stands in for it.
  host.coordsAt = (offset) => ({ left: offset * 8, right: offset * 8 + 8, top: 0, bottom: 16 });
  const cm = new VimEditor(host);
  Vim.enterVimMode(cm as never);
  const ui = new VimUi(cm);
  ui.show();
  cleanups.push(() => {
    ui.destroy();
    Vim.leaveVimMode(cm as never);
    cm.dispose();
    host.destroy();
  });
  return { cm, ui };
}

function press(cm: VimEditor, key: string): void {
  handleVimKey(cm, new KeyboardEvent("keydown", { key, cancelable: true }));
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

test("vim-core's error messages read as errors and its status lines do not", () => {
  for (const message of [
    'Not an editor command ":foo"',
    "No match found foo",
    "No matches for foo",
    "Invalid regex: (",
    "Unknown option: nope",
    "Error: Mark not set",
    "Argument is required.",
    "No previous substitute regular expression",
  ]) {
    expect(isErrorMessage(message), message).toBe(true);
  }
  for (const message of ["3 lines yanked", "  tabstop=4", " nowrap", "Codemirror-vim version: <DEV>", "Nothing"]) {
    expect(isErrorMessage(message), message).toBe(false);
  }
});

test("a rejected ex command marks its message so it can shake", () => {
  const { cm } = setup("text");
  Vim.handleEx(cm as never, "nosuchcommand");
  expect(cm.state.dialog?.classList.contains("bb-vim-notification")).toBe(true);
  expect(cm.state.dialog?.classList.contains("bb-vim-error")).toBe(true);
});

test("a status message is not marked as an error", () => {
  const { cm } = setup("one\ntwo");
  Vim.handleEx(cm as never, "yank");
  expect(cm.state.dialog?.textContent).toContain("yanked");
  expect(cm.state.dialog?.classList.contains("bb-vim-error")).toBe(false);
});

test("the block cursor node is reused across renders so its shape can ease", async () => {
  const { cm } = setup("hello world");
  await nextFrame();
  const layer = document.querySelector(".bb-vim-cursor-layer")!;
  const first = layer.querySelector(".bb-vim-cursor");
  expect(first?.classList.contains("bb-vim-cursor-enter")).toBe(true);

  press(cm, "d");
  await nextFrame();
  const pending = layer.querySelector<HTMLElement>(".bb-vim-cursor");
  expect(pending).toBe(first);
  expect(pending?.style.scale).toBe("1 0.5");

  press(cm, "Escape");
  press(cm, "i");
  await nextFrame();
  expect(layer.querySelector(".bb-vim-cursor")).toBeNull();
  press(cm, "Escape");
  await nextFrame();
  const returned = layer.querySelector(".bb-vim-cursor");
  expect(returned).not.toBe(first);
  expect(returned?.classList.contains("bb-vim-cursor-enter")).toBe(true);
});

test("the mode label pops when one mode label replaces another", async () => {
  const { cm } = setup("hello");
  await nextFrame();
  const mode = document.querySelector(".bb-vim-mode")!;
  expect(mode.textContent).toBe("NORMAL");
  expect(mode.classList.contains("bbm-pop")).toBe(false);
  press(cm, "v");
  await nextFrame();
  expect(mode.textContent).toBe("VISUAL");
  expect(mode.classList.contains("bbm-pop")).toBe(true);
});
