import { describe, expect, it } from "vitest";
import { axisLabels, bucketOffset, bucketStart, bucketStarts, bucketWidth, DAY, HOUR, WEEK } from "./time";

const NOW = Date.UTC(2026, 9, 22, 18, 30);

describe("time buckets", () => {
  it("picks a bucket that keeps about a month of columns", () => {
    expect(bucketWidth(DAY, null, NOW)).toBe(HOUR);
    expect(bucketWidth(7 * DAY, null, NOW)).toBe(6 * HOUR);
    expect(bucketWidth(30 * DAY, null, NOW)).toBe(DAY);
    expect(bucketWidth(null, NOW - 3 * DAY, NOW)).toBe(6 * HOUR);
    expect(bucketWidth(null, NOW - 200 * DAY, NOW)).toBe(WEEK);
    expect(bucketWidth(null, null, NOW)).toBe(HOUR);
  });

  it("floors to the bucket, shifted by the offset, and lists every bucket up to now", () => {
    expect(bucketStart(NOW, HOUR, 0)).toBe(Date.UTC(2026, 9, 22, 18));
    expect(bucketStart(NOW, DAY, 0)).toBe(Date.UTC(2026, 9, 22));
    // Six hours west of UTC: the local day holding 18:30 UTC started at 06:00 UTC.
    expect(bucketStart(NOW, DAY, -6 * HOUR)).toBe(Date.UTC(2026, 9, 22, 6));
    expect(bucketStarts(NOW - 3 * HOUR, NOW, HOUR, 0)).toHaveLength(4);
    expect(bucketStarts(NOW, NOW, DAY, 0)).toEqual([Date.UTC(2026, 9, 22)]);
  });

  it("starts week buckets on a Monday", () => {
    const offset = bucketOffset(WEEK, NOW) + new Date(NOW).getTimezoneOffset() * 60_000;
    const start = bucketStart(NOW, WEEK, offset);
    expect(new Date(start).getUTCDay()).toBe(1);
    expect(start).toBeLessThanOrEqual(NOW);
    expect(NOW - start).toBeLessThan(WEEK);
  });

  it("labels each midnight under hour buckets and at most eight dates under day buckets", () => {
    const hours = bucketStarts(NOW - 23 * HOUR, NOW, HOUR, 0);
    const labels = axisLabels(hours, HOUR, 0);
    expect(labels.filter((label) => label !== null)).toHaveLength(4);
    expect(labels[hours.findIndex((start) => start === Date.UTC(2026, 9, 22))]).not.toBeNull();
    expect(labels[hours.findIndex((start) => start === Date.UTC(2026, 9, 22, 6))]).not.toBeNull();
    expect(axisLabels(bucketStarts(NOW - 6 * DAY, NOW, 6 * HOUR, 0), 6 * HOUR, 0).filter((label) => label !== null)).toHaveLength(6);
    const days = bucketStarts(NOW - 29 * DAY, NOW, DAY, 0);
    expect(axisLabels(days, DAY, 0).filter((label) => label !== null).length).toBeLessThanOrEqual(8);
  });
});
