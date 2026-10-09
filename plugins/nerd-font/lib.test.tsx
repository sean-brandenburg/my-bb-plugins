// @vitest-environment jsdom

import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DETECTED_ATTRIBUTE, GLYPH, Glyph, NERD_FONT_ATTRIBUTE, ensureNerdFont, fileGlyph, nerdFontState, useNerdFont } from "./lib/index";
import { forcedGlyphs } from "./settings";

const root = document.documentElement;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  root.removeAttribute(NERD_FONT_ATTRIBUTE);
  root.removeAttribute(DETECTED_ATTRIBUTE);
  for (const style of document.head.querySelectorAll("style[data-bb-nerd-font]")) style.remove();
});

describe("nerdFontState", () => {
  it("is unknown until the check answers", () => {
    expect(nerdFontState()).toBe("unknown");
    root.setAttribute(DETECTED_ATTRIBUTE, "pending");
    expect(nerdFontState()).toBe("unknown");
  });

  it("follows the check", () => {
    root.setAttribute(DETECTED_ATTRIBUTE, "yes");
    expect(nerdFontState()).toBe("on");
    root.setAttribute(DETECTED_ATTRIBUTE, "no");
    expect(nerdFontState()).toBe("off");
  });

  it("lets a forced choice win over the check", () => {
    root.setAttribute(DETECTED_ATTRIBUTE, "yes");
    root.setAttribute(NERD_FONT_ATTRIBUTE, "off");
    expect(nerdFontState()).toBe("off");
    root.setAttribute(DETECTED_ATTRIBUTE, "no");
    root.setAttribute(NERD_FONT_ATTRIBUTE, "on");
    expect(nerdFontState()).toBe("on");
  });
});

describe("ensureNerdFont", () => {
  it("reports no glyphs when the page can't draw to a canvas", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    ensureNerdFont();
    expect(root.getAttribute(DETECTED_ATTRIBUTE)).toBe("pending");
    await vi.waitFor(() => expect(root.getAttribute(DETECTED_ATTRIBUTE)).toBe("no"));
  });

  it("runs the check once per page and installs one stylesheet", () => {
    root.setAttribute(DETECTED_ATTRIBUTE, "yes");
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    ensureNerdFont();
    ensureNerdFont();
    expect(getContext).not.toHaveBeenCalled();
    expect(root.getAttribute(DETECTED_ATTRIBUTE)).toBe("yes");
    expect(document.head.querySelectorAll("style[data-bb-nerd-font]")).toHaveLength(1);
  });
});

describe("useNerdFont", () => {
  it("re-renders when the answer changes", () => {
    root.setAttribute(DETECTED_ATTRIBUTE, "no");
    const { result } = renderHook(() => useNerdFont());
    expect(result.current).toBe(false);
    act(() => root.setAttribute(NERD_FONT_ATTRIBUTE, "on"));
    return vi.waitFor(() => expect(result.current).toBe(true));
  });
});

describe("Glyph", () => {
  it("hides an unlabelled glyph from screen readers", () => {
    const { container } = render(<Glyph glyph={GLYPH.branch} />);
    const span = container.firstElementChild!;
    expect(span.getAttribute("aria-hidden")).toBe("true");
    expect(span.getAttribute("role")).toBeNull();
  });

  it("names a labelled glyph as an image", () => {
    const { getByRole } = render(<Glyph glyph={GLYPH.prMerged} label="Merged" />);
    expect(getByRole("img", { name: "Merged" }).textContent).toBe(GLYPH.prMerged);
  });
});

describe("fileGlyph", () => {
  it("matches well-known names before extensions", () => {
    expect(fileGlyph("services/api/Dockerfile")).toBe(String.fromCodePoint(0xe650));
    expect(fileGlyph("package.json")).toBe(String.fromCodePoint(0xe71e));
    expect(fileGlyph("app/tsconfig.build.json")).toBe(String.fromCodePoint(0xe69d));
  });

  it("matches by extension, case-insensitively", () => {
    expect(fileGlyph("src/Main.GO")).toBe(String.fromCodePoint(0xe627));
    expect(fileGlyph("lib/types.d.ts")).toBe(String.fromCodePoint(0xe628));
  });

  it("falls back to a plain page", () => {
    expect(fileGlyph("README")).toBe(GLYPH.file);
    expect(fileGlyph("data/blob.unknownext")).toBe(GLYPH.file);
  });
});

describe("forcedGlyphs", () => {
  it("maps the setting to a forced choice, or none for Automatic", () => {
    expect(forcedGlyphs("Always")).toBe("on");
    expect(forcedGlyphs("Never")).toBe("off");
    expect(forcedGlyphs("Automatic")).toBeNull();
    expect(forcedGlyphs(undefined)).toBeNull();
  });
});
