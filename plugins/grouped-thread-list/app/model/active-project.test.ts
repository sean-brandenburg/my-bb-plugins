import { describe, expect, it } from "vitest";
import { makeSidebarThread, type SidebarThreadOverrides } from "./fixtures.js";
import {
  createThreadProjectResolver,
  latestActivityByProject,
  orderProjectsByActivity,
  resolveActiveProjectId,
} from "./active-project.js";

const PROJECTS = [
  { id: "proj_personal", name: "Personal", isPersonal: true },
  { id: "proj_b", name: "Beta", isPersonal: false },
  { id: "proj_a", name: "Alpha", isPersonal: false },
  { id: "proj_c", name: "Gamma", isPersonal: false },
];

function thread(id: string, overrides: SidebarThreadOverrides = {}) {
  return makeSidebarThread({
    id,
    lastReadAt: 10,
    latestAttentionAt: 1,
    updatedAt: 1,
    ...overrides,
  });
}

describe("orderProjectsByActivity", () => {
  it("puts the most recently active first and inactive projects after by name", () => {
    const threads = [
      thread("t1", { projectId: "proj_b", updatedAt: 5 }),
      thread("t2", { projectId: "proj_c", updatedAt: 3, latestAttentionAt: 9 }),
      thread("t3", { projectId: "proj_personal", updatedAt: 100 }),
    ];
    const latest = latestActivityByProject(
      threads,
      createThreadProjectResolver(threads),
    );
    expect(
      orderProjectsByActivity(PROJECTS, latest).map((project) => project.id),
    ).toEqual(["proj_c", "proj_b", "proj_a"]);
  });

  it("credits a child thread's activity to its root ancestor's project", () => {
    const threads = [
      thread("parent", { projectId: "proj_a" }),
      thread("child", {
        projectId: "proj_b",
        parentThreadId: "parent",
        updatedAt: 50,
      }),
    ];
    const latest = latestActivityByProject(
      threads,
      createThreadProjectResolver(threads),
    );
    expect(latest.get("proj_a")).toBe(50);
    expect(latest.has("proj_b")).toBe(false);
  });
});

describe("resolveActiveProjectId", () => {
  const latest = new Map([
    ["proj_b", 5],
    ["proj_a", 2],
  ]);

  it("keeps a stored project that still exists", () => {
    expect(resolveActiveProjectId("proj_a", PROJECTS, latest)).toBe("proj_a");
  });

  it("falls back to the most recently active project for a missing or personal id", () => {
    expect(resolveActiveProjectId(null, PROJECTS, latest)).toBe("proj_b");
    expect(resolveActiveProjectId("proj_gone", PROJECTS, latest)).toBe(
      "proj_b",
    );
    expect(resolveActiveProjectId("proj_personal", PROJECTS, latest)).toBe(
      "proj_b",
    );
  });

  it("returns null when only the personal project exists", () => {
    expect(
      resolveActiveProjectId(null, PROJECTS.slice(0, 1), latest),
    ).toBeNull();
  });
});
