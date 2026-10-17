import { describe, expect, it } from "vitest";
import { describeTokens, formatSpan, formatTokens } from "./ui/format.js";
import { bucketDays, estimateWindow, latestWindows, NO_TOKENS, sessionsBetween, type UsageRecord, WINDOW_MS } from "./usage-model.js";

const HOUR = 3_600_000;
const record = (at: number, sessionId = "s1", output = 10): UsageRecord => ({ ...NO_TOKENS, at, sessionId, output, cacheRead: 100 });

describe("estimateWindow", () => {
  const base = Date.UTC(2026, 9, 17, 10, 0, 0);

  it("opens a window at the hour of the first response and keeps it for five hours", () => {
    expect(estimateWindow([base + 25 * 60_000, base + 2 * HOUR], base + 3 * HOUR)).toEqual({ startMs: base, endMs: base + WINDOW_MS });
  });

  it("starts the next window at the first response after one closes", () => {
    const times = [base + 10 * 60_000, base + 6 * HOUR + 5 * 60_000];
    expect(estimateWindow(times, base + 7 * HOUR)).toEqual({ startMs: base + 6 * HOUR, endMs: base + 11 * HOUR });
  });

  it("reports no window once the last one has closed or before any activity", () => {
    expect(estimateWindow([base], base + 6 * HOUR)).toBeNull();
    expect(estimateWindow([], base)).toBeNull();
  });
});

describe("bucketDays", () => {
  it("sums each local day and fills quiet days with zero, oldest first", () => {
    const now = new Date(2026, 9, 17, 15, 0).getTime();
    const days = bucketDays([record(new Date(2026, 9, 17, 9).getTime()), record(new Date(2026, 9, 17, 1).getTime()), record(new Date(2026, 9, 15, 23).getTime()), record(new Date(2026, 9, 1).getTime())], 3, now);
    expect(days.map((day) => [day.day, day.tokens.output])).toEqual([
      ["2026-10-15", 10],
      ["2026-10-16", 0],
      ["2026-10-17", 20],
    ]);
  });
});

describe("sessionsBetween", () => {
  it("totals sessions inside the window, largest first", () => {
    const output = (at: number, sessionId: string, tokens: number): UsageRecord => ({ ...NO_TOKENS, at, sessionId, output: tokens });
    const sessions = sessionsBetween([output(100, "a", 5), output(200, "b", 50), output(300, "a", 5), output(900, "b", 1000)], 0, 500);
    expect(sessions.map((session) => [session.sessionId, session.tokens.output])).toEqual([
      ["b", 50],
      ["a", 10],
    ]);
  });
});

describe("latestWindows", () => {
  it("keeps each window's newest report and drops ended windows", () => {
    const window = (status: "allowed" | "warning", resetsAtMs: number) => ({ label: "Five-hour limit", providerKey: "five_hour", status, resetsAtMs });
    const windows = latestWindows(
      [
        { at: 300, providerId: "claude-code", windows: [window("warning", 10_000)] },
        { at: 100, providerId: "claude-code", windows: [window("allowed", 10_000)] },
        { at: 200, providerId: "claude-code", windows: [{ label: "Weekly limit", providerKey: "seven_day", status: "warning", resetsAtMs: 500 }] },
      ],
      1000,
    );
    expect(windows).toEqual([expect.objectContaining({ key: "claude-code:five_hour", status: "warning", reportedAt: 300 })]);
  });
});

describe("format", () => {
  it("compacts token counts", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(42_300)).toBe("42k");
    expect(formatTokens(158_000_000)).toBe("158M");
    expect(formatTokens(2_000_000)).toBe("2M");
  });

  it("spells out what a total is made of, leaving out empty parts", () => {
    expect(describeTokens({ input: 0, output: 522_000, cacheRead: 155_000_000, cacheWrite: 2_100_000 })).toBe("158M tokens · 522k output · 2.1M cache write · 155M cache read");
  });

  it("formats spans by their largest units", () => {
    expect(formatSpan(42_000)).toBe("42s");
    expect(formatSpan(130 * 60_000)).toBe("2h 10m");
    expect(formatSpan(3 * 86_400_000)).toBe("3d");
  });
});
