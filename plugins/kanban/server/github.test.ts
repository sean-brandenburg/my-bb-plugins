import { afterEach, describe, expect, it, vi } from "vitest";
import { checksFromRollup, checksUrlFromContexts, fetchPrHeads, parsePrHeads, type PrHeadsData } from "./github";

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
      ["acme/widgets#1", { headRef: "feature/login", checks: "passing", checksUrl: null }],
      ["acme/widgets#2", { headRef: "fix", checks: null, checksUrl: null }],
      ["acme/widgets#5", { headRef: "empty", checks: null, checksUrl: null }],
    ]);
  });

  it("links the checks tick to the failing check, else a pending one, else the first with a page", () => {
    const run = (conclusion: string | null, detailsUrl: string, status = "COMPLETED") => ({ __typename: "CheckRun", status, conclusion, detailsUrl });
    const context = (state: string, targetUrl: string | null) => ({ __typename: "StatusContext", state, targetUrl });
    expect(checksUrlFromContexts([run("SUCCESS", "https://ci/ok"), context("FAILURE", "https://ci/status-failed"), run("FAILURE", "https://ci/failed")])).toBe("https://ci/status-failed");
    expect(checksUrlFromContexts([run("SUCCESS", "https://ci/ok"), run(null, "https://ci/running", "IN_PROGRESS"), context("PENDING", "https://ci/pending")])).toBe("https://ci/running");
    expect(checksUrlFromContexts([context("SUCCESS", null), run("SUCCESS", "https://ci/ok"), run("NEUTRAL", "https://ci/neutral")])).toBe("https://ci/ok");
    expect(checksUrlFromContexts([context("SUCCESS", null), null])).toBeNull();
    expect(checksUrlFromContexts(undefined)).toBeNull();
    const data: PrHeadsData = {
      pr0: { pullRequest: { headRefName: "feature/login", commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE", contexts: { nodes: [run("SUCCESS", "https://ci/ok"), run("FAILURE", "https://ci/failed")] } } } }] } } },
    };
    expect(parsePrHeads(prs.slice(0, 1), data).get("acme/widgets#1")).toEqual({ headRef: "feature/login", checks: "failing", checksUrl: "https://ci/failed" });
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
    expect(heads.get("acme/widgets#40")).toEqual({ headRef: "branch-40", checks: "pending", checksUrl: null });
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
