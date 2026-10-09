import { describe, expect, it } from "vitest";
import { arrive } from "./arrival.js";

describe("arrive", () => {
  it("enters with the segment", () => {
    expect(arrive(null, "145k", 145_000).arrival).toBe("enter");
  });

  it("keeps the same arrival while the value is unchanged", () => {
    const first = arrive(null, "145k", 145_000);
    expect(arrive(first, "145k", 145_200)).toBe(first);
  });

  it("goes up or down with the rank of the new value", () => {
    const first = arrive(null, "145k", 145_000);
    const grown = arrive(first, "146k", 146_000);
    expect(grown.arrival).toBe("up");
    expect(arrive(grown, "40k", 40_000).arrival).toBe("down");
  });

  it("treats an unranked change as up", () => {
    const first = arrive(null, "claude-opus-5-5", 0);
    expect(arrive(first, "claude-sonnet-5-5", 0).arrival).toBe("up");
  });
});
