import { afterEach, describe, expect, it, vi } from "vitest";
import { checksFromRollup, fetchPrHeads, parsePrHeads, type PrHeadsData } from "./github";

const pull = (headRefName: string, rollup: { state: string } | null) => ({
  pullRequest: { headRefName, commits: { nodes: [{ commit: { statusCheckRollup: rollup } }] } },
});

describe("checksFromRollup", () => {
  it("folds GitHub's status states into passing, failing, and pending", () => {
    expect(checksFromRollup("SUCCESS")).toBe("passing");
    expect(checksFromRollup("FAILURE")).toBe("failing");
    expect(checksFromRollup("ERROR")).toBe("failing");
    expect(checksFromRollup("PENDING")).toBe("pending");
    expect(checksFromRollup("EXPECTED")).toBe("pending");
    expect(checksFromRollup(null)).toBeNull();
    expect(checksFromRollup(undefined)).toBeNull();
    expect(checksFromRollup("SOMETHING_NEW")).toBeNull();
  });
});

describe("parsePrHeads", () => {
  const prs = [
    { repo: "acme/widgets", number: 1 },
    { repo: "acme/widgets", number: 2 },
    { repo: "acme/gone", number: 3 },
    { repo: "acme/widgets", number: 4 },
    { repo: "acme/widgets", number: 5 },
  ];

  it("reads each alias in order, treating a missing rollup as no checks and a missing node as unknown", () => {
    const data: PrHeadsData = {
      pr0: pull("feature/login", { state: "SUCCESS" }),
      pr1: pull("fix", null),
      pr2: null,
      pr3: { pullRequest: null },
      pr4: { pullRequest: { headRefName: "empty", commits: { nodes: [] } } },
    };
    const heads = parsePrHeads(prs, data);
    expect([...heads]).toEqual([
      ["acme/widgets#1", { headRef: "feature/login", checks: "passing" }],
      ["acme/widgets#2", { headRef: "fix", checks: null }],
      ["acme/widgets#5", { headRef: "empty", checks: null }],
    ]);
  });

  it("returns nothing when the response had no data", () => {
    expect(parsePrHeads(prs, null).size).toBe(0);
    expect(parsePrHeads(prs, undefined).size).toBe(0);
  });
});

describe("fetchPrHeads", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks in chunks with the PRs as variables, keeping the chunks that answered when one fails", async () => {
    const prs = Array.from({ length: 45 }, (_, index) => ({ repo: "acme/widgets", number: index + 1 }));
    const bodies: Array<{ query: string; variables: Record<string, string | number> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, string | number> };
        bodies.push(body);
        if (bodies.length === 2) return new Response("boom", { status: 502 });
        const data = Object.fromEntries(
          Object.keys(body.variables)
            .filter((key) => key.startsWith("number"))
            .map((key) => [`pr${key.slice("number".length)}`, pull(`branch-${body.variables[key]}`, { state: "PENDING" })]),
        );
        return new Response(JSON.stringify({ data, errors: [{ message: "Could not resolve to a Repository" }] }), { status: 200 });
      }),
    );
    const warnings: string[] = [];
    const heads = await fetchPrHeads(prs, "tok", undefined, (message) => warnings.push(message));

    expect(bodies).toHaveLength(2);
    expect(Object.keys(bodies[0]!.variables).filter((key) => key.startsWith("number"))).toHaveLength(40);
    expect(bodies[0]!.variables).toMatchObject({ owner0: "acme", name0: "widgets", number0: 1 });
    expect(bodies[0]!.query).not.toContain("widgets");
    expect(heads.size).toBe(40);
    expect(heads.get("acme/widgets#40")).toEqual({ headRef: "branch-40", checks: "pending" });
    expect(heads.has("acme/widgets#41")).toBe(false);
    expect(warnings).toEqual([expect.stringContaining("Could not resolve"), expect.stringContaining("502")]);
  });

  it("makes no request when there are no open PRs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchPrHeads([], "tok", undefined, () => undefined)).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
