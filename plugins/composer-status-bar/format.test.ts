import { GLYPH } from "bb-nerd-font";
import { describe, expect, it } from "vitest";
import {
  compactModel,
  effortGlyph,
  formatContext,
  formatReset,
  formatTokens,
  rateLimitNotice,
  resolveModelName,
} from "./format.js";

describe("resolveModelName", () => {
  const catalog = [
    { id: "claude-opus-5-5", model: "claude-opus-5-5", displayName: "Opus 5.5" },
    { id: "claude-opus-5", model: "claude-opus-5", displayName: "Opus 5" },
    { id: "claude-sonnet-5-5", model: "claude-sonnet-5-5", displayName: "Sonnet 5.5" },
  ];

  it("names an exact catalog id", () => {
    expect(resolveModelName(catalog, "claude-opus-5")).toBe("Opus 5");
  });

  it("resolves a family alias to the newest model in that family", () => {
    expect(resolveModelName(catalog, "opus")).toBe("Opus 5.5");
    expect(resolveModelName(catalog, "sonnet")).toBe("Sonnet 5.5");
  });

  it("falls back to the raw id when the catalog doesn't know it", () => {
    expect(resolveModelName(catalog, "gpt-6")).toBe("gpt-6");
  });
});

describe("formatTokens", () => {
  it("abbreviates thousands and millions", () => {
    expect(formatTokens(812)).toBe("812");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(96_112)).toBe("96k");
    expect(formatTokens(1_000_000)).toBe("1M");
    expect(formatTokens(1_250_000)).toBe("1.3M");
  });
});

describe("formatContext", () => {
  it("splits used and window, leaving the window out when unknown", () => {
    expect(formatContext({ usedTokens: 96_112, modelContextWindow: 1_000_000 })).toEqual({
      used: "96k",
      window: "1M",
    });
    expect(formatContext({ usedTokens: 4200, modelContextWindow: null })).toEqual({
      used: "4.2k",
      window: null,
    });
    expect(formatContext({ usedTokens: null, modelContextWindow: 200_000 })).toBeNull();
    expect(formatContext(null)).toBeNull();
  });
});

describe("formatReset", () => {
  it("picks the coarsest unit that stays readable", () => {
    expect(formatReset(25 * 60_000, 0)).toBe("25m");
    expect(formatReset(5 * 3_600_000, 0)).toBe("5h");
    expect(formatReset(72 * 3_600_000, 0)).toBe("3d");
    expect(formatReset(0, 60_000)).toBe("0m");
  });
});

describe("rateLimitNotice", () => {
  const now = 0;

  it("stays silent while every window is allowed", () => {
    expect(
      rateLimitNotice([{ label: "Weekly limit", status: "allowed", resetsAtMs: null }], now),
    ).toBeNull();
  });

  it("reports a blocked window ahead of a warning one", () => {
    expect(
      rateLimitNotice(
        [
          { label: "Weekly limit", status: "warning", resetsAtMs: 3_600_000 },
          { label: "5-hour limit", status: "blocked", resetsAtMs: 30 * 60_000 },
        ],
        now,
      ),
    ).toEqual({
      text: "30m",
      title: "5-hour limit reached · resets in 30m",
      blocked: true,
    });
  });

  it("ignores a window that has already reset", () => {
    expect(
      rateLimitNotice([{ label: "Weekly limit", status: "warning", resetsAtMs: 1000 }], 2000),
    ).toBeNull();
  });

  it("falls back to a generic label and omits an unknown reset", () => {
    expect(rateLimitNotice([{ label: null, status: "warning", resetsAtMs: null }], now)).toEqual({
      text: "limit",
      title: "Usage limit nearly used",
      blocked: false,
    });
  });
});

describe("compactModel", () => {
  it("draws a Claude family as its glyph and keeps only the version", () => {
    expect(compactModel("Opus 5.5")).toEqual({ glyph: GLYPH.crown, text: "5.5" });
    expect(compactModel("Sonnet 5")).toEqual({ glyph: GLYPH.feather, text: "5" });
    expect(compactModel("Haiku 5.5")).toEqual({ glyph: GLYPH.leaf, text: "5.5" });
    expect(compactModel("Fable 5.1")).toEqual({ glyph: GLYPH.bookOpen, text: "5.1" });
  });

  it("shows only the glyph for a bare family alias", () => {
    expect(compactModel("opus")).toEqual({ glyph: GLYPH.crown, text: "" });
  });

  it("keeps the whole name for other providers' models", () => {
    expect(compactModel("GPT-5.3 Codex")).toEqual({ glyph: GLYPH.robot, text: "GPT-5.3 Codex" });
  });
});

describe("effortGlyph", () => {
  it("gives the common level ids fixed glyphs wherever the provider lists them", () => {
    const claude = ["low", "medium", "high", "xhigh", "ultracode", "max"];
    expect(claude.map((id, index) => effortGlyph(id, index, claude.length))).toEqual([
      GLYPH.gaugeLow,
      GLYPH.gauge,
      GLYPH.gaugeFull,
      GLYPH.fire,
      GLYPH.rocketLaunch,
      GLYPH.fireAlert,
    ]);
    expect(effortGlyph("none", 0, 6)).toBe(GLYPH.gaugeEmpty);
  });

  it("fills the gauge along a five-level list of unknown ids and burns at the top", () => {
    expect([0, 1, 2, 3, 4].map((index) => effortGlyph(`level-${index}`, index, 5))).toEqual([
      GLYPH.gaugeEmpty,
      GLYPH.gaugeLow,
      GLYPH.gauge,
      GLYPH.gaugeFull,
      GLYPH.fire,
    ]);
  });

  it("tops out at a full gauge on a short list", () => {
    expect([0, 1, 2].map((index) => effortGlyph(`level-${index}`, index, 3))).toEqual([GLYPH.gaugeEmpty, GLYPH.gauge, GLYPH.gaugeFull]);
  });

  it("shows a middling gauge for a single level", () => {
    expect(effortGlyph("only", 0, 1)).toBe(GLYPH.gauge);
  });
});
