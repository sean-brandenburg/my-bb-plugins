// @vitest-environment jsdom

import { keymapConflicts, unboundHelpKeys } from "bb-vim-keys";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DECISION_KEYMAP, DECISION_KEYS, mountPromptKeys, QUESTION_KEYMAP, QUESTION_KEYS } from "./prompt-keys.js";

window.requestAnimationFrame ??= ((cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0)) as never;
window.cancelAnimationFrame ??= ((id: number) => window.clearTimeout(id)) as never;

interface Question {
  prompt: string;
  options: string[];
  multi?: boolean;
  other?: boolean;
}

interface Answer {
  selected: string[];
  other: boolean;
}

let contentIds = 0;

/** bb's collapsible banner shell, the part every kind of banner shares. */
function shell(testId: string, label: string, expanded: boolean) {
  const section = document.createElement("section");
  section.dataset.testid = testId;
  section.setAttribute("aria-label", label);
  const id = `_r_${++contentIds}_`;
  section.innerHTML = `
    <div class="flex">
      <button type="button" aria-controls="${id}" aria-label="${label}">${label}</button>
      <button type="button" aria-controls="${id}" aria-label="Hide details"></button>
    </div>
    <div id="${id}"></div>`;
  const content = section.querySelector<HTMLElement>(`#${id}`)!;
  const setExpanded = (open: boolean) => {
    section.toggleAttribute("data-expanded", open);
    content.hidden = !open;
    for (const toggle of section.querySelectorAll(":scope > div > button")) {
      toggle.setAttribute("aria-expanded", String(open));
    }
  };
  setExpanded(expanded);
  for (const toggle of section.querySelectorAll<HTMLButtonElement>(":scope > div > button")) {
    toggle.addEventListener("click", () => setExpanded(!section.hasAttribute("data-expanded")));
  }
  // bb folds an open banner on Escape unless something already handled it.
  section.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || !section.hasAttribute("data-expanded")) return;
    setExpanded(false);
    section.querySelector<HTMLButtonElement>('[aria-label="Hide details"]')!.focus();
  });
  return { section, content };
}

/**
 * Stands in for bb's question banner, re-rendering the way React does: the
 * answers are new nodes after every change of question, and Next and Submit
 * only see answers that have been drawn.
 */
class QuestionBanner {
  readonly section: HTMLElement;
  private readonly content: HTMLElement;
  current = 0;
  answers: Answer[];
  submitted: Answer[][] = [];
  cancelled = false;

  constructor(private readonly questions: Question[]) {
    ({ section: this.section, content: this.content } = shell(
      "user-question-banner",
      questions.length === 1 ? "Question" : `${questions.length} questions`,
      true,
    ));
    this.answers = questions.map((question) => ({ selected: [], other: question.options.length === 0 }));
    this.render();
  }

  get question() {
    return this.questions[this.current]!;
  }

  get choices(): HTMLButtonElement[] {
    return [...this.section.querySelectorAll<HTMLButtonElement>("fieldset button[aria-pressed]")];
  }

  get textarea(): HTMLTextAreaElement | null {
    return this.section.querySelector("fieldset textarea");
  }

  get tabs(): HTMLButtonElement[] {
    return [...this.section.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].filter(
      (button) => !button.closest("fieldset"),
    );
  }

  render() {
    const question = this.question;
    const answer = this.answers[this.current]!;
    const mark = question.multi ? "rounded" : "rounded-full";
    const choice = (label: string, checked: boolean) =>
      `<button type="button" aria-pressed="${checked}"><span class="mt-0.5 flex size-4 border ${mark}"></span><span>${label}</span></button>`;
    const tabs =
      this.questions.length > 1
        ? `<div class="mb-2 flex"><div class="flex">${this.questions
            .map(
              (q, index) =>
                `<div><button type="button" aria-pressed="${index === this.current}" title="${q.prompt}"><span>Q${index + 1}</span></button></div>`,
            )
            .join("")}</div><span>${this.current + 1} of ${this.questions.length}</span></div>`
        : "";
    const options = question.options
      .map((label) => `<div>${choice(label, answer.selected.includes(label))}</div>`)
      .join("");
    const other = question.other && question.options.length > 0 ? choice("Other…", answer.other) : "";
    const last = this.current === this.questions.length - 1;
    this.content.innerHTML = `
      <div><div><div tabindex="-1" class="flex">
        ${tabs}
        <div><fieldset class="min-w-0"><legend class="sr-only">${question.prompt}</legend>
          <div class="text-sm">${question.prompt}</div>
          <div class="mt-2 space-y-0.5">${options}${other}</div>
          ${answer.other ? '<textarea aria-label="answer"></textarea>' : ""}
        </fieldset></div>
        <div class="mt-3 flex"><button type="button">Cancel</button><div class="flex">${
          this.current > 0 ? '<button type="button">Back</button>' : ""
        }<button type="button">${last ? "Submit answer" : "Next"}</button></div></div>
      </div></div></div>`;
    const answered = answer.selected.length > 0 || answer.other;
    question.options.forEach((label, index) => {
      this.choices[index]!.addEventListener("click", () => this.pick(label));
    });
    if (other) this.choices.at(-1)!.addEventListener("click", () => this.pickOther());
    this.tabs.forEach((tab, index) =>
      tab.addEventListener("click", () => {
        this.current = index;
        this.render();
      }),
    );
    const footer = [...this.content.querySelectorAll<HTMLButtonElement>(".mt-3 button")];
    footer[0]!.addEventListener("click", () => (this.cancelled = true));
    const primary = footer.at(-1)!;
    primary.disabled = last && !this.answers.every((a) => a.selected.length > 0 || a.other);
    const drawn = this.answers.map((a) => ({ ...a, selected: [...a.selected] }));
    primary.addEventListener("click", () => {
      if (!last) {
        this.current++;
        this.render();
      } else if (answered) this.submitted.push(drawn);
    });
    if (answer.other) this.textarea!.focus();
  }

  private pick(label: string) {
    const answer = this.answers[this.current]!;
    if (this.question.multi) {
      answer.selected = answer.selected.includes(label)
        ? answer.selected.filter((value) => value !== label)
        : [...answer.selected, label];
    } else {
      answer.selected = [label];
      answer.other = false;
    }
    this.renderSoon();
  }

  private pickOther() {
    const answer = this.answers[this.current]!;
    if (this.question.multi) answer.other = !answer.other;
    else {
      answer.selected = [];
      answer.other = true;
    }
    this.renderSoon();
  }

  /** React draws a click's state change after the click handler returns. */
  private renderSoon() {
    queueMicrotask(() => {
      const focused = this.choices.indexOf(document.activeElement as HTMLButtonElement);
      this.render();
      if (focused >= 0 && !this.answers[this.current]!.other) this.choices[focused]?.focus();
    });
  }
}

/** bb's tool approval banner: folded at first, with its buttons in the body. */
function approvalBanner() {
  const { section, content } = shell("approval-banner", "Approval needed", false);
  const decided: string[] = [];
  content.innerHTML = `<h3>Run a command?</h3><div><p>git status</p></div><div class="mt-3 flex">${[
    "Deny",
    "Allow for session",
    "Allow once",
  ]
    .map((label) => `<button type="button">${label}</button>`)
    .join("")}</div>`;
  for (const button of content.querySelectorAll<HTMLButtonElement>(".mt-3 > button")) {
    button.addEventListener("click", () => decided.push(button.textContent!));
  }
  let scrollTop = 0;
  Object.defineProperty(content, "scrollTop", { get: () => scrollTop, set: (value: number) => (scrollTop = value) });
  Object.defineProperty(content, "clientHeight", { get: () => 200 });
  return { section, content, decided };
}

/** A thread's composer: the waiting banner above the prompt box. */
function composer(prompt = "") {
  const root = document.createElement("div");
  root.setAttribute("data-app-composer", "");
  root.innerHTML = `<form data-promptbox><div contenteditable="true" tabindex="0">${prompt}</div></form>`;
  document.body.append(root);
  const editor = root.querySelector<HTMLElement>('[contenteditable="true"]')!;
  return { root, editor, show: (banner: HTMLElement) => root.prepend(banner) };
}

const frames = async (count = 3) => {
  for (let i = 0; i < count; i++) await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
};

const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.activeElement ?? document.body) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

const focusedLabel = () => (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? null;

let unmount: () => void;

beforeEach(() => {
  unmount = mountPromptKeys(document, window);
});

afterEach(() => {
  unmount();
  document.body.replaceChildren();
  (document.activeElement as HTMLElement | null)?.blur?.();
});

describe("questions", () => {
  it("takes focus when a question appears while nothing is focused, and opts the banner out of vim-mode", async () => {
    const page = composer();
    const banner = new QuestionBanner([{ prompt: "Name?", options: ["Alpha", "Beta"] }]);
    page.show(banner.section);
    await frames();
    expect(document.activeElement).toBe(banner.choices[0]);
    expect(banner.section.hasAttribute("data-vim-ignore")).toBe(true);
  });

  it("takes focus from an empty prompt box but not from a half-typed prompt", async () => {
    const empty = composer();
    empty.editor.focus();
    const first = new QuestionBanner([{ prompt: "Name?", options: ["Alpha"] }]);
    empty.show(first.section);
    await frames();
    expect(document.activeElement).toBe(first.choices[0]);

    document.body.replaceChildren();
    const typing = composer("half a thought");
    typing.editor.focus();
    const second = new QuestionBanner([{ prompt: "Name?", options: ["Alpha"] }]);
    typing.show(second.section);
    await frames();
    expect(document.activeElement).toBe(typing.editor);
  });

  it("moves through the answers with j, k, gg and G, stopping at the ends", async () => {
    const page = composer();
    const banner = new QuestionBanner([{ prompt: "Name?", options: ["Alpha", "Beta", "Gamma"], other: true }]);
    page.show(banner.section);
    await frames();
    press("j");
    expect(focusedLabel()).toBe("Beta");
    press("j");
    press("j");
    press("j");
    expect(focusedLabel()).toBe("Other…");
    press("k");
    expect(focusedLabel()).toBe("Gamma");
    press("g");
    expect(focusedLabel()).toBe("Gamma");
    press("g");
    expect(focusedLabel()).toBe("Alpha");
    press("G", { shiftKey: true });
    expect(focusedLabel()).toBe("Other…");
  });

  it("picks the answer on Enter and goes on, then submits on the last question", async () => {
    const page = composer();
    const banner = new QuestionBanner([
      { prompt: "Name?", options: ["Alpha", "Beta"] },
      { prompt: "Colour?", options: ["Red", "Blue"] },
    ]);
    page.show(banner.section);
    await frames();
    press("j");
    const enter = press("Enter");
    expect(enter.defaultPrevented).toBe(true);
    await frames();
    expect(banner.current).toBe(1);
    expect(banner.answers[0]!.selected).toEqual(["Beta"]);
    expect(focusedLabel()).toBe("Red");

    press("Enter");
    await frames();
    expect(banner.submitted).toEqual([
      [
        { selected: ["Beta"], other: false },
        { selected: ["Red"], other: false },
      ],
    ]);
  });

  it("toggles with x on a many-answer question, where Enter only goes on", async () => {
    const page = composer();
    const banner = new QuestionBanner([
      { prompt: "Extras?", options: ["Hints", "Sounds"], multi: true },
      { prompt: "Name?", options: ["Alpha"] },
    ]);
    page.show(banner.section);
    await frames();
    press("x");
    await frames(1);
    press("j");
    press("x");
    await frames(1);
    expect(banner.answers[0]!.selected).toEqual(["Hints", "Sounds"]);
    press("x");
    await frames(1);
    expect(banner.answers[0]!.selected).toEqual(["Hints"]);
    press("Enter");
    await frames();
    expect(banner.answers[0]!.selected).toEqual(["Hints"]);
    expect(banner.current).toBe(1);
  });

  it("steps between questions with h and l", async () => {
    const page = composer();
    const banner = new QuestionBanner([
      { prompt: "Name?", options: ["Alpha"] },
      { prompt: "Colour?", options: ["Red", "Blue"] },
    ]);
    page.show(banner.section);
    await frames();
    press("l");
    await frames();
    expect(banner.current).toBe(1);
    expect(focusedLabel()).toBe("Red");
    press("l");
    await frames();
    expect(banner.current).toBe(1);
    press("h");
    await frames();
    expect(banner.current).toBe(0);
    expect(focusedLabel()).toBe("Alpha");
  });

  it("types your own answer on i, and Escape goes back to the answers without folding the banner", async () => {
    const page = composer();
    const banner = new QuestionBanner([{ prompt: "Name?", options: ["Alpha"], other: true }]);
    page.show(banner.section);
    await frames();
    press("i");
    await frames();
    expect(document.activeElement).toBe(banner.textarea);
    expect(press("j").defaultPrevented).toBe(false);

    const escape = press("Escape");
    expect(escape.defaultPrevented).toBe(true);
    expect(banner.section.hasAttribute("data-expanded")).toBe(true);
    expect(focusedLabel()).toBe("Other…");
  });

  it("opens a folded question on a movement key", async () => {
    const page = composer();
    const banner = new QuestionBanner([{ prompt: "Name?", options: ["Alpha", "Beta"] }]);
    page.show(banner.section);
    await frames();
    press("Escape");
    expect(banner.section.hasAttribute("data-expanded")).toBe(false);
    press("j");
    await frames();
    expect(banner.section.hasAttribute("data-expanded")).toBe(true);
    expect(focusedLabel()).toBe("Alpha");
  });

  it("returns focus to the prompt box once the question is answered", async () => {
    const page = composer();
    const banner = new QuestionBanner([{ prompt: "Name?", options: ["Alpha"] }]);
    page.show(banner.section);
    await frames();
    banner.section.remove();
    await frames();
    expect(document.activeElement).toBe(page.editor);
  });

  it("moves focus into a waiting question when Escape leaves the prompt box", async () => {
    const page = composer("draft");
    page.editor.focus();
    const banner = new QuestionBanner([{ prompt: "Name?", options: ["Alpha"] }]);
    page.show(banner.section);
    await frames();
    expect(document.activeElement).toBe(page.editor);
    press("Escape");
    page.editor.blur();
    await frames();
    expect(document.activeElement).toBe(banner.choices[0]);
  });

  it("leaves a prompt box blurred by a click alone", async () => {
    const page = composer("draft");
    page.editor.focus();
    const banner = new QuestionBanner([{ prompt: "Name?", options: ["Alpha"] }]);
    page.show(banner.section);
    await frames();
    page.editor.blur();
    await frames();
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves Cmd and Alt shortcuts, digits, and keys aimed elsewhere to bb", async () => {
    const page = composer();
    const banner = new QuestionBanner([{ prompt: "Name?", options: ["Alpha", "Beta"] }]);
    page.show(banner.section);
    await frames();
    expect(press("j", { metaKey: true }).defaultPrevented).toBe(false);
    expect(press("j", { altKey: true }).defaultPrevented).toBe(false);
    expect(press("2").defaultPrevented).toBe(false);
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();
    expect(press("j").defaultPrevented).toBe(false);
  });

  it("shows its keys on ?, and Escape hides them before folding anything", async () => {
    const page = composer();
    const banner = new QuestionBanner([{ prompt: "Name?", options: ["Alpha"] }]);
    page.show(banner.section);
    await frames();
    press("?", { shiftKey: true });
    expect(document.querySelector("[data-prompt-keys-panel]")?.textContent).toContain("Pick the answer and go on");
    press("Escape");
    expect(document.querySelector("[data-prompt-keys-panel]")).toBeNull();
    expect(banner.section.hasAttribute("data-expanded")).toBe(true);
  });

  it("closes its keys on a key it doesn't bind, leaving that key to bb", async () => {
    const page = composer();
    const banner = new QuestionBanner([{ prompt: "Name?", options: ["Alpha"] }]);
    page.show(banner.section);
    await frames();
    press("?", { shiftKey: true });
    expect(document.querySelector("[data-prompt-keys-panel]")).not.toBeNull();
    expect(press("q").defaultPrevented).toBe(false);
    expect(document.querySelector("[data-prompt-keys-panel]")).toBeNull();
  });

  it("scrolls the question on Ctrl-D without leaving the answers", async () => {
    const page = composer();
    const banner = new QuestionBanner([{ prompt: "Name?", options: ["Alpha", "Beta"] }]);
    page.show(banner.section);
    await frames();
    const content = banner.section.querySelector<HTMLElement>("[id]")!;
    Object.defineProperty(content, "clientHeight", { get: () => 100 });
    expect(press("d", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(content.scrollTop).toBe(50);
    expect(focusedLabel()).toBe("Alpha");
  });
});

describe("approvals", () => {
  it("focuses the folded banner, unfolds on l, and walks its buttons", async () => {
    const page = composer();
    const banner = approvalBanner();
    page.show(banner.section);
    await frames();
    expect(document.activeElement?.getAttribute("aria-expanded")).toBe("false");

    press("l");
    await frames();
    expect(banner.section.hasAttribute("data-expanded")).toBe(true);
    expect(focusedLabel()).toBe("Deny");
    press("l");
    press("l");
    press("l");
    expect(focusedLabel()).toBe("Allow once");
    press("h");
    expect(focusedLabel()).toBe("Allow for session");
    // Enter is the button's own, so nothing is decided by a key that only moves.
    expect(press("Enter").defaultPrevented).toBe(false);
    expect(banner.decided).toEqual([]);
  });

  it("enters the button row from the right on h", async () => {
    const page = composer();
    const banner = approvalBanner();
    page.show(banner.section);
    await frames();
    press("h");
    await frames();
    expect(focusedLabel()).toBe("Allow once");
  });

  it("scrolls the details with j, k, Ctrl-D and gg", async () => {
    const page = composer();
    const banner = approvalBanner();
    page.show(banner.section);
    await frames();
    press("l");
    await frames();
    press("j");
    press("j");
    expect(banner.content.scrollTop).toBe(80);
    press("k");
    expect(banner.content.scrollTop).toBe(40);
    press("d", { ctrlKey: true });
    expect(banner.content.scrollTop).toBe(140);
    press("g");
    press("g");
    expect(banner.content.scrollTop).toBe(0);
  });
});

describe("keys", () => {
  it("has no sequence that starts another", () => {
    expect(keymapConflicts(QUESTION_KEYMAP)).toEqual([]);
    expect(keymapConflicts(DECISION_KEYMAP)).toEqual([]);
  });

  it("lists only keys it binds, besides the focused button's own Space and Enter", () => {
    expect(unboundHelpKeys(QUESTION_KEYS, QUESTION_KEYMAP, ["Space"])).toEqual([]);
    expect(unboundHelpKeys(DECISION_KEYS, DECISION_KEYMAP, ["Enter"])).toEqual([]);
  });

  it("shows the decision keys over an approval", async () => {
    const page = composer();
    page.show(approvalBanner().section);
    await frames();
    press("?", { shiftKey: true });
    const rows = [...document.querySelectorAll("[data-prompt-keys-panel] [data-key-help-row]")];
    expect(rows[0]!.querySelector("span")!.textContent).toBe("hl");
    expect(rows[0]!.lastElementChild!.textContent).toBe("Move across the buttons");
  });
});
