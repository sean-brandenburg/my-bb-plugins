/** `on` or `off` on `<html>` forces the choice; the Nerd Font plugin's setting writes it. */
export const NERD_FONT_ATTRIBUTE = "data-nerd-font";
/**
 * The check's result on `<html>`, so every plugin bundle on the page shares one check instead of each running its own.
 * `pending` while it runs.
 */
export const DETECTED_ATTRIBUTE = "data-nerd-font-detected";
export const GLYPH_CLASS = "bbnf-glyph";

// The theme's code font first, so glyphs match it when it is a Nerd Font; then the fonts that carry only the symbols,
// and the patched families people most often install, so a theme with a plain code font still finds an installed one.
const GLYPH_FONT_FAMILY = [
  "var(--font-mono)",
  '"Symbols Nerd Font Mono"',
  '"Symbols Nerd Font"',
  '"FiraCode Nerd Font Mono"',
  '"JetBrainsMono Nerd Font Mono"',
  '"Hack Nerd Font Mono"',
  '"MesloLGS Nerd Font Mono"',
  '"CaskaydiaCove Nerd Font Mono"',
  '"Iosevka Nerd Font Mono"',
  "monospace",
].join(", ");

const STYLE_ATTRIBUTE = "data-bb-nerd-font";
const GLYPH_CSS = `
.${GLYPH_CLASS} {
  display: inline-block;
  flex-shrink: 0;
  font-family: ${GLYPH_FONT_FAMILY};
  font-style: normal;
  font-weight: 400;
  font-variant-ligatures: none;
  line-height: 1;
  text-align: center;
  text-decoration: none;
}
`;

// Pairs of different icons from the same Unicode block. Without a font that has them, both members of a pair draw the
// same placeholder (a .notdef box, or the block's Last Resort glyph on macOS), so different pixels mean real glyphs.
// One pair per icon set the plugins use: seti, octicons, and Material Design (which sits outside the BMP).
const PROBE_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0xe628, 0xe627],
  [0xf407, 0xf419],
  [0xf0874, 0xf01a5],
];
const PROBE_SIZE = 32;

export type NerdFontState = "on" | "off" | "unknown";

export function nerdFontState(doc: Document = document): NerdFontState {
  const root = doc.documentElement;
  const forced = root.getAttribute(NERD_FONT_ATTRIBUTE);
  if (forced === "on" || forced === "off") return forced;
  const detected = root.getAttribute(DETECTED_ATTRIBUTE);
  return detected === "yes" ? "on" : detected === "no" ? "off" : "unknown";
}

function installStyle(doc: Document): void {
  if (doc.head.querySelector(`style[${STYLE_ATTRIBUTE}]`) !== null) return;
  const style = doc.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = GLYPH_CSS;
  doc.head.append(style);
}

function resolvedGlyphFont(doc: Document): string {
  const probe = doc.createElement("span");
  probe.className = GLYPH_CLASS;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  doc.body.append(probe);
  // Canvas fonts take no var(), so read the family list after the browser has substituted --font-mono.
  const family = doc.defaultView?.getComputedStyle(probe).fontFamily ?? "";
  probe.remove();
  return `${PROBE_SIZE - 8}px ${family === "" ? "monospace" : family}`;
}

function drawGlyphs(doc: Document, font: string): boolean {
  const canvas = doc.createElement("canvas");
  canvas.width = PROBE_SIZE;
  canvas.height = PROBE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return false;
  const pixels = (codepoint: number) => {
    context.clearRect(0, 0, PROBE_SIZE, PROBE_SIZE);
    context.font = font;
    context.textBaseline = "top";
    context.fillStyle = "#000";
    context.fillText(String.fromCodePoint(codepoint), 4, 4);
    return context.getImageData(0, 0, PROBE_SIZE, PROBE_SIZE).data;
  };
  return PROBE_PAIRS.every(([a, b]) => {
    const first = pixels(a);
    const second = pixels(b);
    let inked = false;
    let differs = false;
    for (let index = 3; index < first.length; index += 4) {
      if (first[index] !== 0) inked = true;
      if (first[index] !== second[index]) differs = true;
      if (inked && differs) return true;
    }
    return false;
  });
}

async function detect(doc: Document): Promise<boolean> {
  try {
    const font = resolvedGlyphFont(doc);
    const text = PROBE_PAIRS.flat().map((codepoint) => String.fromCodePoint(codepoint)).join("");
    // A theme can supply the code font as a web font, which only downloads once something asks for it.
    await doc.fonts?.load(font, text);
    return drawGlyphs(doc, font);
  } catch {
    return false;
  }
}

/** Installs the glyph stylesheet and starts the page's check if nothing has; safe to call any number of times. */
export function ensureNerdFont(doc: Document = document): void {
  installStyle(doc);
  const root = doc.documentElement;
  if (root.hasAttribute(DETECTED_ATTRIBUTE)) return;
  root.setAttribute(DETECTED_ATTRIBUTE, "pending");
  void detect(doc).then((found) => root.setAttribute(DETECTED_ATTRIBUTE, found ? "yes" : "no"));
}

/** Calls back when the answer to "do glyphs render" may have changed; returns the unsubscribe. */
export function subscribeNerdFont(callback: () => void, doc: Document = document): () => void {
  ensureNerdFont(doc);
  const observer = new MutationObserver(callback);
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: [NERD_FONT_ATTRIBUTE, DETECTED_ATTRIBUTE] });
  return () => observer.disconnect();
}
