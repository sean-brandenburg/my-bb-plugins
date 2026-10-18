import type { KeyHelpSection } from "./reader.ts";

/**
 * A shortcuts list as plain DOM, for content scripts with no React tree: each section's title
 * (when it has one) and then a row per entry, `<div data-key-help-row><span><kbd>j</kbd>…</span><span>action</span></div>`.
 * The plugin styles it; `KeyHelp` in `bb-vim-keys/react` is the React grid.
 */
export function renderKeyHelp(doc: Document, sections: readonly KeyHelpSection[]): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  for (const section of sections) {
    if (section.title !== "") {
      const title = doc.createElement("div");
      title.setAttribute("data-key-help-title", "");
      title.textContent = section.title;
      fragment.append(title);
    }
    for (const { keys, action } of section.keys) {
      const row = doc.createElement("div");
      row.setAttribute("data-key-help-row", "");
      const sequence = doc.createElement("span");
      for (const key of keys) sequence.append(Object.assign(doc.createElement("kbd"), { textContent: key }));
      row.append(sequence, Object.assign(doc.createElement("span"), { textContent: action }));
      fragment.append(row);
    }
  }
  return fragment;
}
