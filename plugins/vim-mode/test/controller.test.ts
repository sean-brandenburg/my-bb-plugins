import { EditorView } from "@codemirror/view";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, expect, test } from "vitest";
import { mountVimMode } from "../src/vim/controller";
import { DEFAULT_OPTIONS } from "../src/vim/options";
import { installLayoutStubs } from "./harness";

installLayoutStubs();
// jsdom has no requestAnimationFrame-driven layout; render synchronously enough for assertions.
globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)) as never;

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  document.body.replaceChildren();
});

function mount() {
  const reports: string[] = [];
  const dispose = mountVimMode(() => DEFAULT_OPTIONS, (level, message) => reports.push(`${level}: ${message}`));
  cleanups.push(dispose);
  return reports;
}

function promptBox(text: string): Editor {
  const form = document.createElement("form");
  form.setAttribute("data-promptbox", "");
  document.body.appendChild(form);
  return new Editor({ element: form, extensions: [StarterKit], content: `<p>${text}</p>` });
}

function press(target: HTMLElement, key: string) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function isNormalMode(element: HTMLElement): boolean {
  return press(element, "l").defaultPrevented;
}

test("attaches to a new editor after bb destroys the previous prompt box", () => {
  const reports = mount();
  const first = promptBox("first");
  first.view.dom.focus();
  press(first.view.dom, "Escape");
  expect(isNormalMode(first.view.dom)).toBe(true);

  // Navigating to another thread unmounts the old editor.
  first.destroy();
  first.options.element && (first.options.element as HTMLElement).remove();

  const second = promptBox("second");
  second.view.dom.focus();
  press(second.view.dom, "Escape");
  expect(isNormalMode(second.view.dom)).toBe(true);
  expect(reports.filter((line) => line.startsWith("error"))).toEqual([]);
});

test("attaches to a CodeMirror editor after a prompt box was destroyed", () => {
  const reports = mount();
  const prompt = promptBox("prompt");
  prompt.view.dom.focus();
  prompt.destroy();

  const view = new EditorView({ doc: "a note", parent: document.body });
  view.contentDOM.focus();
  press(view.contentDOM, "Escape");
  expect(isNormalMode(view.contentDOM)).toBe(true);
  expect(reports.filter((line) => line.startsWith("error"))).toEqual([]);
  expect(reports.some((line) => line.includes("attach codemirror"))).toBe(true);
});

test("a key in an editor whose focus event was missed still attaches", () => {
  mount();
  const prompt = promptBox("text");
  // Simulate focus that arrived without a focusin event reaching the plugin.
  const stop = (event: Event) => event.stopImmediatePropagation();
  document.addEventListener("focusin", stop, true);
  window.addEventListener("focusin", stop, true);
  prompt.view.dom.focus();
  document.removeEventListener("focusin", stop, true);
  window.removeEventListener("focusin", stop, true);
  press(prompt.view.dom, "Escape");
  expect(isNormalMode(prompt.view.dom)).toBe(true);
});

test("Escape in idle normal mode off a thread page reaches the app", () => {
  mount();
  const prompt = promptBox("text");
  prompt.view.dom.focus();
  press(prompt.view.dom, "Escape");
  let reached = false;
  const outer = () => {
    reached = true;
  };
  document.addEventListener("keydown", outer);
  const second = press(prompt.view.dom, "Escape");
  document.removeEventListener("keydown", outer);
  expect(reached).toBe(true);
  expect(second.defaultPrevented).toBe(false);
});

function pressCtrl(target: HTMLElement, key: string) {
  const event = new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

test("Ctrl+O and Ctrl+I reach the app as back/forward in normal and insert mode", () => {
  mount();
  const prompt = promptBox("text");
  prompt.view.dom.focus();
  const reached: string[] = [];
  const outer = (event: KeyboardEvent) => {
    if (event.ctrlKey) reached.push(event.key);
  };
  document.addEventListener("keydown", outer);
  pressCtrl(prompt.view.dom, "o");
  press(prompt.view.dom, "Escape");
  pressCtrl(prompt.view.dom, "o");
  pressCtrl(prompt.view.dom, "i");
  document.removeEventListener("keydown", outer);
  expect(reached).toEqual(["o", "o", "i"]);
});

function focusIn(target: HTMLElement) {
  target.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
}

// jsdom lays nothing out, so fields need a size to count as visible.
function textField(
  tag: "textarea" | "input",
  attributes: Record<string, string> = {},
  parent: HTMLElement = document.body,
): HTMLElement {
  const field = document.createElement(tag);
  field.getBoundingClientRect = () => new DOMRect(0, 0, 200, 40);
  for (const [name, value] of Object.entries(attributes)) field.setAttribute(name, value);
  parent.appendChild(field);
  return field;
}

function mountWith(overrides: Partial<typeof DEFAULT_OPTIONS>) {
  const reports: string[] = [];
  const dispose = mountVimMode(
    () => ({ ...DEFAULT_OPTIONS, ...overrides }),
    (level, message) => reports.push(`${level}: ${message}`),
  );
  cleanups.push(dispose);
  return reports;
}

test("attaches to visible textareas and text inputs", () => {
  const reports = mount();
  focusIn(textField("textarea"));
  const input = textField("input", { type: "search" });
  focusIn(input);
  expect(reports).toEqual(["info: attach text-field textarea", "info: attach text-field input"]);
  press(input, "Escape");
  expect(isNormalMode(input)).toBe(true);
});

test("skips picker inputs, tiny fields, and non-text inputs", () => {
  const reports = mount();
  for (const attributes of <Record<string, string>[]>[
    { role: "combobox" },
    { "cmdk-input": "" },
    { "aria-autocomplete": "list" },
    { "aria-haspopup": "listbox" },
    { type: "checkbox" },
  ]) {
    focusIn(textField("input", attributes));
  }
  const tiny = document.createElement("textarea");
  document.body.appendChild(tiny);
  focusIn(tiny);
  expect(reports).toEqual([
    ...Array(5).fill("info: skip input: not a supported text box"),
    "info: skip textarea: not a supported text box",
  ]);
});

test("skips text boxes inside excluded containers", () => {
  const reports = mount();
  for (const [attribute, className] of [
    ["data-vim-ignore", "ignored"],
    ["data-bb-vim-ui", "vim-ui"],
    ["class", "xterm"],
  ] as const) {
    const wrapper = document.createElement("div");
    wrapper.className = className;
    wrapper.setAttribute(attribute, attribute === "class" ? className : "");
    document.body.appendChild(wrapper);
    focusIn(textField("textarea", {}, wrapper));
  }
  // The plugin's own UI is ignored silently; it is never a vim target.
  expect(reports).toEqual([
    "info: skip textarea: inside excluded div.ignored",
    "info: skip textarea: inside excluded div.xterm",
  ]);
});

test("reports why editor-looking elements without an editor are skipped", () => {
  const reports = mount();
  const editor = document.createElement("div");
  editor.className = "cm-editor";
  const content = document.createElement("div");
  content.className = "cm-content";
  editor.appendChild(content);
  const proseMirror = document.createElement("div");
  proseMirror.className = "ProseMirror";
  document.body.append(editor, proseMirror);
  focusIn(content);
  focusIn(proseMirror);
  expect(reports).toEqual([
    "info: skip div.cm-content: no CodeMirror view reachable from .cm-content (cm* keys: none)",
    "info: skip div.ProseMirror: ProseMirror element without a TipTap editor",
  ]);
});

test("inputs inside a CodeMirror editor belong to that editor", () => {
  const reports = mount();
  const view = new EditorView({ doc: "a note", parent: document.body });
  focusIn(textField("input", {}, view.dom));
  expect(reports).toEqual(["info: skip input: not a supported text box"]);
});

test("does not report focus on elements that are not text boxes", () => {
  const reports = mount();
  const button = document.createElement("button");
  document.body.appendChild(button);
  focusIn(button);
  expect(reports).toEqual([]);
});

test("disabled vim mode reports why it skipped a text box", () => {
  const reports = mountWith({ enabled: false });
  focusIn(textField("textarea"));
  expect(reports).toEqual(["info: skip textarea: disabled in settings"]);
});

test("prompt box scope attaches only to the prompt box", () => {
  const reports = mountWith({ scope: "composer" });
  const prompt = promptBox("prompt");
  focusIn(prompt.view.dom);
  const note = new Editor({
    element: document.body.appendChild(document.createElement("div")),
    extensions: [StarterKit],
  });
  focusIn(note.view.dom);
  focusIn(textField("textarea"));
  const view = new EditorView({ doc: "a note", parent: document.body });
  focusIn(view.contentDOM);
  expect(reports.map((line) => line.replace(/ div\.[^: ]*/, " div"))).toEqual([
    "info: attach prosemirror div",
    "info: skip div: not a supported text box",
    "info: skip textarea: not a supported text box",
    "info: skip div: CodeMirror editor outside 'Prompt box only' scope",
  ]);
});

test("Enter in idle normal mode reaches the app", () => {
  mount();
  const prompt = promptBox("text");
  prompt.view.dom.focus();
  press(prompt.view.dom, "Escape");
  const reached: string[] = [];
  const outer = (event: KeyboardEvent) => reached.push(event.key);
  document.addEventListener("keydown", outer);
  press(prompt.view.dom, "Enter");
  press(prompt.view.dom, "d");
  press(prompt.view.dom, "Enter");
  document.removeEventListener("keydown", outer);
  expect(reached).toEqual(["Enter"]);
});

test("Escape in insert mode goes to an open typeahead menu, completion, or voice input", () => {
  mount();
  const prompt = promptBox("text");
  const form = prompt.view.dom.closest("form")!;
  prompt.view.dom.focus();
  const menu = document.createElement("div");
  menu.setAttribute("data-promptbox-typeahead-menu", "");
  form.appendChild(menu);
  expect(press(prompt.view.dom, "Escape").defaultPrevented).toBe(false);
  menu.remove();
  form.setAttribute("data-promptbox-voice-active", "");
  expect(press(prompt.view.dom, "Escape").defaultPrevented).toBe(false);
  form.removeAttribute("data-promptbox-voice-active");
  expect(press(prompt.view.dom, "Escape").defaultPrevented).toBe(true);

  const view = new EditorView({ doc: "a note", parent: document.body });
  view.contentDOM.focus();
  press(view.contentDOM, "Escape");
  press(view.contentDOM, "a");
  const completion = document.createElement("div");
  completion.className = "cm-tooltip-autocomplete";
  view.dom.appendChild(completion);
  expect(press(view.contentDOM, "Escape").defaultPrevented).toBe(false);
  completion.remove();
  expect(press(view.contentDOM, "Escape").defaultPrevented).toBe(true);
});
