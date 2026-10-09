import { describe, expect, it } from "vitest";
import { makeSidebarThread, type SidebarThreadOverrides } from "./fixtures.js";
import { buildPinnedThreadTree } from "./pinned-sidebar-threads.js";
import type { ProjectThreadNode } from "./project-thread-groups.js";
import type { SidebarThread } from "./sidebar-thread.js";

function createThread(overrides: SidebarThreadOverrides = {}): SidebarThread {
  return makeSidebarThread({
    id: "thr_1",
    projectId: "proj_1",
    title: "Thread",
    titleFallback: "Thread",
    lastReadAt: 0,
    latestAttentionAt: 2,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  });
}

function rootIds(tree: readonly ProjectThreadNode[]): string[] {
  return tree.map((node) => node.thread.id);
}

function treeIds(tree: readonly ProjectThreadNode[]): string[] {
  return tree.flatMap((node) => [node.thread.id, ...treeIds(node.children)]);
}

describe("buildPinnedThreadTree", () => {
  it("sorts visible pinned roots by global pin sort key", () => {
    const tree = buildPinnedThreadTree([
      createThread({
        id: "unpinned",
        createdAt: 4,
      }),
      createThread({
        id: "pinned-late",
        pinnedAt: 1_000,
        pinSortKey: "b",
      }),
      createThread({
        id: "pinned-early",
        pinnedAt: 2_000,
        pinSortKey: "a",
      }),
    ]);

    expect(rootIds(tree)).toEqual(["pinned-early", "pinned-late"]);
    expect(treeIds(tree).sort()).toEqual([
      "pinned-early",
      "pinned-late",
    ]);
  });

  it("orders pin sort keys by codepoint, not locale", () => {
    const tree = buildPinnedThreadTree([
      createThread({
        id: "pinned-lower",
        pinnedAt: 1_000,
        pinSortKey: "a",
      }),
      createThread({
        id: "pinned-upper",
        pinnedAt: 2_000,
        pinSortKey: "Z",
      }),
    ]);

    expect(rootIds(tree)).toEqual(["pinned-upper", "pinned-lower"]);
  });

  it("moves every descendant with a pinned parent regardless of type", () => {
    const tree = buildPinnedThreadTree([
      createThread({
        id: "standard-parent",
        pinnedAt: 1_000,
        pinSortKey: "a",
      }),
      createThread({
        id: "manager-child",
        parentThreadId: "standard-parent",
      }),
      createThread({
        id: "standard-grandchild",
        parentThreadId: "manager-child",
      }),
      createThread({
        id: "root",
      }),
    ]);

    expect(treeIds(tree).sort()).toEqual([
      "manager-child",
      "standard-grandchild",
      "standard-parent",
    ]);
    expect(rootIds(tree)).toEqual(["standard-parent"]);
    expect(treeIds(tree[0]?.children ?? []).length).toBe(2);
  });

  it("renders an explicitly pinned child as a root when its parent is not pinned", () => {
    const tree = buildPinnedThreadTree([
      createThread({
        id: "parent",
      }),
      createThread({
        id: "child",
        parentThreadId: "parent",
        pinnedAt: 1_000,
        pinSortKey: "a",
      }),
    ]);

    expect(rootIds(tree)).toEqual(["child"]);
  });

  it("does not pull source-derived forks in as pinned descendants", () => {
    const tree = buildPinnedThreadTree([
      createThread({
        id: "parent",
        pinnedAt: 1_000,
        pinSortKey: "a",
      }),
      createThread({
        id: "fork",
        sourceThreadId: "parent",
        originKind: "fork",
      }),
    ]);

    expect(rootIds(tree)).toEqual(["parent"]);
    expect(treeIds(tree[0]?.children ?? []).length).toBe(0);
  });

  it("hides an explicitly pinned child under its pinned ancestor root", () => {
    const tree = buildPinnedThreadTree([
      createThread({
        id: "parent",
        pinnedAt: 2_000,
        pinSortKey: "a",
      }),
      createThread({
        id: "child",
        parentThreadId: "parent",
        pinnedAt: 1_000,
        pinSortKey: "b",
      }),
    ]);

    expect(rootIds(tree)).toEqual(["parent"]);
    expect(tree[0]?.children[0]?.thread.id).toBe("child");
    expect(treeIds(tree[0]?.children ?? []).length).toBe(1);
  });

  it("keeps pinned roots flat even when they have sections", () => {
    const tree = buildPinnedThreadTree([
      createThread({
        id: "a",
        title: "Alpha",
        sectionId: "sec_work",
        pinnedAt: 1_000,
        pinSortKey: "a",
      }),
    ]);

    expect(rootIds(tree)).toEqual(["a"]);
  });
});
