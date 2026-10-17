// @vitest-environment jsdom
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { rpcContract, WorktreeRow } from "./rpc-contract.js";

// jsdom lays nothing out, so every row would count as hidden.
beforeAll(() => {
  HTMLElement.prototype.getClientRects = function () {
    return [new DOMRect(0, 0, 100, 20)] as unknown as DOMRectList;
  };
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

const NOW = Date.now();

function thread(id: string, overrides: Partial<PluginSidebarThread> = {}): PluginSidebarThread {
  return {
    id,
    projectId: "proj_a",
    title: id,
    titleFallback: null,
    displayTitle: `Thread ${id}`,
    parentThreadId: null,
    lifecycleOwnerThreadId: null,
    sourceThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "claude-code",
    status: "idle",
    runtimeStatus: "idle",
    queuedWork: "none",
    hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    pinnedAt: null,
    pinSortKey: null,
    isArchived: false,
    archivedAt: null,
    href: `/projects/proj_a/threads/${id}`,
    isHidden: false,
    environment: null,
    host: null,
    createdAt: NOW - 60_000,
    updatedAt: NOW - 60_000,
    lastReadAt: null,
    latestAttentionAt: NOW - 60_000,
    ...overrides,
  } as PluginSidebarThread;
}

const unusedWorktree: WorktreeRow = {
  environmentId: "env_unused",
  projectId: "proj_a",
  branchName: "bb/old-work-thr_aaaaaa",
  path: "/worktrees/old-work",
  tree: "clean",
  changedFiles: 0,
  insertions: 0,
  deletions: 0,
  unused: true,
  thread: { id: "thr_archived", title: "Old work", archived: true },
  lastActiveAt: NOW - 3 * 86_400_000,
};

async function render(projectId: string | null, cleanupCalls: string[] = []) {
  const app = await loadPluginApp(() => import("./app.js"));
  return renderSlot<{ projectId: string | null }, typeof rpcContract>(
    app.homepageSections[0]!,
    { projectId },
    {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread("thr_asking", { status: "active", runtimeStatus: "active", hasPendingInteraction: true, indicator: "waiting-for-input" }),
          thread("thr_working", { status: "active", runtimeStatus: "active", activity: { workflows: 0, backgroundAgents: 2, backgroundCommands: 0, planMode: 0, goals: 0 } }),
          thread("thr_elsewhere", { projectId: "proj_b", indicator: "unread-success" }),
        ],
      },
      rpc: {
        worktrees: () => ({ rows: [unusedWorktree], total: 1, held: [{ pluginId: "kanban", projectId: "proj_a", count: 3 }], checkedAt: NOW }),
        cleanup_worktree: ({ environmentId }) => {
          cleanupCalls.push(environmentId);
          return { ok: true as const };
        },
      },
      sdk: {
        projects: { list: async () => [{ id: "proj_a", name: "alpha" }, { id: "proj_b", name: "beta" }] },
        threads: { events: { list: async () => [] } },
      } as never,
    },
  );
}

const press = async (key: string) => {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
};

async function waitFor(check: () => void, timeoutMs = 1000) {
  const start = Date.now();
  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (Date.now() - start > timeoutMs) throw error;
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    }
  }
}

afterEach(() => {
  (document.activeElement as HTMLElement | null)?.blur();
});

describe("Dashboard", () => {
  it("shows what needs the user, what runs, and worktrees to tidy", async () => {
    const slot = await render(null);
    expect(slot.getByText("Thread thr_asking")).toBeTruthy();
    expect(slot.getByText(/Needs input/)).toBeTruthy();
    expect(slot.getByText("Thread thr_working")).toBeTruthy();
    expect(slot.getByText(/2 agents/)).toBeTruthy();
    expect(slot.getByText("Thread thr_elsewhere")).toBeTruthy();
    expect(await slot.findByText("Old work")).toBeTruthy();
    expect(slot.getByText("3 worktrees kept by hidden kanban threads")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("narrows every group to the selected project", async () => {
    const slot = await render("proj_b");
    expect(slot.getByText("Thread thr_elsewhere")).toBeTruthy();
    expect(slot.queryByText("Thread thr_asking")).toBeNull();
    await waitFor(() => expect(slot.inspection.rpcCalls.length).toBeGreaterThan(0));
    expect(slot.queryByText("Old work")).toBeNull();
    expect(slot.queryByText(/kept by hidden/)).toBeNull();
    slot.lifecycle.unmount();
  });

  it("moves with j and opens the thread under the cursor with Enter", async () => {
    const slot = await render(null);
    await press("j");
    expect(document.activeElement?.textContent).toContain("Thread thr_asking");
    await press("j");
    await press("Enter");
    expect(slot.inspection.sidebarActionCalls).toEqual([expect.objectContaining({ method: "open", threadId: "thr_elsewhere" })]);
    slot.lifecycle.unmount();
  });

  it("cleans up an unused worktree after dd and y, and n cancels", async () => {
    const cleanups: string[] = [];
    const slot = await render(null, cleanups);
    await slot.findByText("Old work");
    await press("G");
    expect(document.activeElement?.textContent).toContain("Old work");
    await press("d");
    await press("d");
    expect(slot.getByText(/Remove the worktree for old-work/)).toBeTruthy();
    await press("n");
    expect(slot.queryByText(/Remove the worktree/)).toBeNull();
    expect(cleanups).toEqual([]);
    await press("d");
    await press("d");
    await press("y");
    await waitFor(() => expect(cleanups).toEqual(["env_unused"]));
    expect(await slot.findByText("Cleaned up old-work.")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("ignores keys typed into a text box elsewhere", async () => {
    const slot = await render(null);
    const input = document.createElement("textarea");
    document.body.append(input);
    input.focus();
    await press("j");
    expect(document.activeElement).toBe(input);
    input.remove();
    slot.lifecycle.unmount();
  });
});
