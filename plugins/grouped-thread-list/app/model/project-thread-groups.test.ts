import { describe, expect, it } from "vitest";
import {
  buildThreadTree,
  compareByCreatedAtDescending,
  createSidebarProjectIdResolver,
  type ProjectThreadNode,
} from "./project-thread-groups.js";
import {
  makeSidebarEnvironment,
  makeSidebarThread,
  type SidebarThreadOverrides,
} from "./fixtures.js";
import type { SidebarThread } from "./sidebar-thread.js";

type TreeSummary = string | { id: string; children: TreeSummary[] };

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

function summarizeNodes(nodes: readonly ProjectThreadNode[]): TreeSummary[] {
  return nodes.map((node) =>
    node.children.length === 0
      ? node.thread.id
      : { id: node.thread.id, children: summarizeNodes(node.children) },
  );
}

function findNode(
  nodes: readonly ProjectThreadNode[],
  threadId: string,
): ProjectThreadNode | null {
  for (const node of nodes) {
    if (node.thread.id === threadId) return node;
    const childNode = findNode(node.children, threadId);
    if (childNode) return childNode;
  }
  return null;
}

function resolveSidebarProjectId(
  thread: SidebarThread,
  threadById: ReadonlyMap<string, SidebarThread>,
): string {
  return createSidebarProjectIdResolver(threadById)(thread);
}

describe("buildThreadTree", () => {
  it("nests threads recursively from parentThreadId regardless of thread type", () => {
    const tree = buildThreadTree([
      createThread({
        id: "manager-root",
        createdAt: 10,
      }),
      createThread({
        id: "standard-child",
        parentThreadId: "manager-root",
        createdAt: 20,
      }),
      createThread({
        id: "standard-grandchild",
        parentThreadId: "standard-child",
        createdAt: 30,
      }),
      createThread({
        id: "manager-grandchild",
        parentThreadId: "standard-grandchild",
        createdAt: 40,
      }),
    ]);

    expect(summarizeNodes(tree)).toEqual([
      {
        id: "manager-root",
        children: [
          {
            id: "standard-child",
            children: [
              {
                id: "standard-grandchild",
                children: ["manager-grandchild"],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("renders forks as roots and excludes side chats", () => {
    const tree = buildThreadTree([
      createThread({
        id: "thr_parent",
        createdAt: 10,
        latestAttentionAt: 30,
      }),
      createThread({
        id: "thr_fork",
        sourceThreadId: "thr_parent",
        originKind: "fork",
        createdAt: 20,
        latestAttentionAt: 20,
      }),
      createThread({
        id: "thr_sidechat",
        sourceThreadId: "thr_parent",
        isHidden: true,
        createdAt: 30,
        latestAttentionAt: 40,
      }),
    ]);

    expect(summarizeNodes(tree)).toEqual(["thr_parent", "thr_fork"]);
    expect(findNode(tree, "thr_parent")?.children).toEqual([]);
    expect(findNode(tree, "thr_sidechat")).toBeNull();
  });

  it("keeps orphaned children as project roots", () => {
    const tree = buildThreadTree([
      createThread({
        id: "orphan-child",
        parentThreadId: "missing-parent",
        createdAt: 20,
        latestAttentionAt: 20,
      }),
      createThread({
        id: "root-thread",
        createdAt: 10,
        latestAttentionAt: 10,
      }),
    ]);

    expect(summarizeNodes(tree)).toEqual(["orphan-child", "root-thread"]);
  });

  it("cuts cycles without duplicating or dropping every cycle member", () => {
    const tree = buildThreadTree([
      createThread({
        id: "cycle-a",
        parentThreadId: "cycle-b",
        createdAt: 10,
      }),
      createThread({
        id: "cycle-b",
        parentThreadId: "cycle-a",
        createdAt: 20,
      }),
    ]);

    expect(summarizeNodes(tree)).toEqual([
      {
        id: "cycle-a",
        children: ["cycle-b"],
      },
    ]);
  });

  it("sorts siblings with active rows first, then inactive attention recency", () => {
    const tree = buildThreadTree([
      createThread({
        id: "root",
      }),
      createThread({
        id: "active-older-created",
        parentThreadId: "root",
        status: "active",
        createdAt: 10,
        latestAttentionAt: 2_000,
        runtimeStatus: "active",
      }),
      createThread({
        id: "active-newer-created",
        parentThreadId: "root",
        status: "active",
        createdAt: 20,
        latestAttentionAt: 1_500,
        runtimeStatus: "active",
      }),
      createThread({
        id: "idle-newer-attention",
        parentThreadId: "root",
        createdAt: 40,
        latestAttentionAt: 900,
      }),
      createThread({
        id: "idle-older-attention",
        parentThreadId: "root",
        createdAt: 30,
        latestAttentionAt: 750,
      }),
    ]);

    expect(summarizeNodes(tree)).toEqual([
      {
        id: "root",
        children: [
          "active-newer-created",
          "active-older-created",
          "idle-newer-attention",
          "idle-older-attention",
        ],
      },
    ]);
  });

  it("keeps worktree siblings flat rather than grouping them", () => {
    const environment = makeSidebarEnvironment({
      id: "env_wt",
      isWorktree: true,
    });
    const tree = buildThreadTree([
      createThread({ id: "wt-a", environment, createdAt: 10 }),
      createThread({ id: "wt-b", environment, createdAt: 20 }),
    ]);

    expect(summarizeNodes(tree)).toEqual(["wt-b", "wt-a"]);
  });

  it("orders roots by literal createdAt when given the created comparator", () => {
    const threads = [
      createThread({
        id: "active-old",
        status: "active",
        createdAt: 10,
        latestAttentionAt: 5,
        runtimeStatus: "active",
      }),
      createThread({
        id: "idle-new",
        status: "idle",
        createdAt: 50,
        latestAttentionAt: 5,
      }),
    ];

    expect(summarizeNodes(buildThreadTree(threads))).toEqual([
      "active-old",
      "idle-new",
    ]);

    expect(
      summarizeNodes(
        buildThreadTree(threads, compareByCreatedAtDescending),
      ),
    ).toEqual(["idle-new", "active-old"]);
  });
});
describe("resolveSidebarProjectId", () => {
  it("files a child from another project under its root ancestor's project", () => {
    const root = createThread({ id: "thr_root", projectId: "proj_a" });
    const child = createThread({
      id: "thr_child",
      parentThreadId: "thr_root",
      projectId: "proj_b",
    });
    const grandchild = createThread({
      id: "thr_grandchild",
      parentThreadId: "thr_child",
      projectId: "proj_c",
    });
    const threadById = new Map(
      [root, child, grandchild].map((thread) => [thread.id, thread]),
    );

    expect(resolveSidebarProjectId(root, threadById)).toBe("proj_a");
    expect(resolveSidebarProjectId(child, threadById)).toBe("proj_a");
    expect(resolveSidebarProjectId(grandchild, threadById)).toBe("proj_a");
  });

  it("falls back to the thread's own project when the parent is not listed", () => {
    const orphan = createThread({
      id: "thr_orphan",
      parentThreadId: "thr_missing",
      projectId: "proj_b",
    });
    expect(
      resolveSidebarProjectId(orphan, new Map([[orphan.id, orphan]])),
    ).toBe("proj_b");
  });

  it("stops at a cycle instead of looping", () => {
    const left = createThread({
      id: "thr_left",
      parentThreadId: "thr_right",
      projectId: "proj_a",
    });
    const right = createThread({
      id: "thr_right",
      parentThreadId: "thr_left",
      projectId: "proj_b",
    });
    const threadById = new Map([
      [left.id, left],
      [right.id, right],
    ]);
    expect(resolveSidebarProjectId(left, threadById)).toBe("proj_b");
  });

  it("memoizes ancestor walks across siblings and descendants", () => {
    const root = createThread({ id: "thr_root", projectId: "proj_a" });
    const child = createThread({
      id: "thr_child",
      parentThreadId: "thr_root",
      projectId: "proj_b",
    });
    const grandchildren = Array.from({ length: 5 }, (_, index) =>
      createThread({
        id: `thr_grandchild_${index}`,
        parentThreadId: "thr_child",
        projectId: "proj_c",
      }),
    );
    const all = [root, child, ...grandchildren];
    const lookups: string[] = [];
    const threadById = new Map(all.map((thread) => [thread.id, thread]));
    const spyingMap: ReadonlyMap<string, SidebarThread> = {
      ...threadById,
      get: (id: string) => {
        lookups.push(id);
        return threadById.get(id);
      },
    } as unknown as ReadonlyMap<string, SidebarThread>;
    const resolve = createSidebarProjectIdResolver(spyingMap);

    expect(all.map(resolve)).toEqual(Array(all.length).fill("proj_a"));
    expect(lookups).toEqual([
      "thr_root",
      "thr_child",
      "thr_child",
      "thr_child",
      "thr_child",
      "thr_child",
    ]);
  });
});
