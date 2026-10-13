const STYLE_ATTRIBUTE = "data-no-selection-menu";

// bb's selection toolbar has no plugin contract or setting. Its radix popover
// content carries this exact Tailwind set, which nothing else in bb 0.45 uses;
// a bb update that changes it just brings the toolbar back.
export const SELECTION_MENU =
  ".z-50.flex.w-auto.items-center.rounded-md.border.bg-popover.p-0\\.5.gap-0\\.5";

export const NO_SELECTION_MENU_CSS = `
${SELECTION_MENU} {
  display: none !important;
}
`;

/** Installs the stylesheet that hides the toolbar; returns cleanup. */
export function mountNoSelectionMenu(doc: Document): () => void {
  const style = doc.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = NO_SELECTION_MENU_CSS;
  doc.head.append(style);
  return () => style.remove();
}
