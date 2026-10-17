import { describe, expect, it } from "vitest";
import { summarizeWorktrees, type ThreadRef, type WorktreeEnvironment } from "./server/worktrees.js";
import { nearestIndex } from "./ui/cursor.js";
import { formatSpan, shortBranch } from "./ui/format.js";
import { latestWindows } from "./ui/limits.js";
import { attentionOf, groupThreads } from "./ui/threads.js";
import { canCleanUp } from "./worktree.js";

const environment = (id: string, updatedAt = 1000): WorktreeEnvironment => ({
  id,
  projectId: "proj_a",
  branchName: `bb/${id}-thr_abc123`,
  path: `/worktrees/${id}`,
  updatedAt,
});

const thread = (id: string, environmentId: string, overrides: Partial<ThreadRef> = {}): ThreadRef => ({
  id,
  environmentId,
  title: id,
  updatedAt: 2000,
  archived: false,
  hidden: false,
  originPluginId: null,
  ...overrides,
});

const clean = { state: "clean", files: 0, insertions: 0, deletions: 0 };
const dirty = { state: "dirty_uncommitted", files: 3, insertions: 40, deletions: 2 };

describe("summarizeWorktrees", () => {
  it("leaves out clean worktrees a visible live thread uses", () => {
    const summary = summarizeWorktrees([environment("env_1")], new Map([["env_1", clean]]), [thread("thr_1", "env_1")]);
    expect(summary).toEqual({ rows: [], held: [] });
  });

  it("reports changes on a worktree in use, with its live thread", () => {
    const { rows } = summarizeWorktrees([environment("env_1")], new Map([["env_1", dirty]]), [
      thread("thr_old", "env_1", { archived: true, updatedAt: 5000 }),
      thread("thr_live", "env_1"),
    ]);
    expect(rows).toEqual([
      expect.objectContaining({ environmentId: "env_1", tree: "dirty", unused: false, changedFiles: 3, insertions: 40, deletions: 2, thread: { id: "thr_live", title: "thr_live", archived: false } }),
    ]);
    expect(canCleanUp(rows[0]!)).toBe(false);
  });

  it("offers a clean worktree with only archived threads for cleanup, pointing at the newest", () => {
    const { rows } = summarizeWorktrees([environment("env_1")], new Map([["env_1", clean]]), [
      thread("thr_a", "env_1", { archived: true, updatedAt: 3000 }),
      thread("thr_b", "env_1", { archived: true, updatedAt: 4000 }),
    ]);
    expect(rows).toEqual([expect.objectContaining({ unused: true, tree: "clean", thread: { id: "thr_b", title: "thr_b", archived: true }, lastActiveAt: 4000 })]);
    expect(canCleanUp(rows[0]!)).toBe(true);
  });

  it("never offers cleanup when git status couldn't be read", () => {
    const { rows } = summarizeWorktrees([environment("env_1")], new Map([["env_1", null]]), []);
    expect(rows).toEqual([expect.objectContaining({ unused: true, tree: "unknown" })]);
    expect(canCleanUp(rows[0]!)).toBe(false);
  });

  it("counts worktrees only hidden plugin threads use instead of listing them", () => {
    const summary = summarizeWorktrees(
      [environment("env_1"), environment("env_2"), environment("env_3")],
      new Map([
        ["env_1", clean],
        ["env_2", clean],
        ["env_3", dirty],
      ]),
      [
        thread("thr_1", "env_1", { hidden: true, originPluginId: "kanban" }),
        thread("thr_2", "env_2", { hidden: true, originPluginId: "kanban" }),
        thread("thr_3", "env_3", { hidden: true, originPluginId: "kanban" }),
      ],
    );
    expect(summary.held).toEqual([{ pluginId: "kanban", projectId: "proj_a", count: 2 }]);
    expect(summary.rows.map((row) => row.environmentId)).toEqual(["env_3"]);
  });

  it("lists changed worktrees first, newest first, then unused ones, longest idle first", () => {
    const { rows } = summarizeWorktrees(
      [environment("env_unused_new", 9000), environment("env_dirty_old", 1000), environment("env_unused_old", 2000), environment("env_dirty_new", 8000)],
      new Map([
        ["env_unused_new", clean],
        ["env_dirty_old", dirty],
        ["env_unused_old", clean],
        ["env_dirty_new", dirty],
      ]),
      [thread("thr_1", "env_dirty_old", { updatedAt: 1500 }), thread("thr_2", "env_dirty_new", { updatedAt: 8500 })],
    );
    expect(rows.map((row) => row.environmentId)).toEqual(["env_dirty_new", "env_dirty_old", "env_unused_old", "env_unused_new"]);
  });
});

type GroupThread = Parameters<typeof groupThreads>[0][number];

const sidebarThread = (id: string, overrides: Partial<GroupThread> = {}): GroupThread => ({
  id,
  projectId: "proj_a",
  status: "idle",
  runtimeStatus: "idle",
  indicator: "none",
  hasPendingInteraction: false,
  isHidden: false,
  latestAttentionAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe("groupThreads", () => {
  it("reads attention from bb's row indicator and pending interactions", () => {
    expect(attentionOf(sidebarThread("a", { indicator: "waiting-for-input" }))).toBe("input");
    expect(attentionOf(sidebarThread("a", { status: "active", hasPendingInteraction: true, indicator: "runtime" }))).toBe("input");
    expect(attentionOf(sidebarThread("a", { indicator: "unread-error" }))).toBe("failed");
    expect(attentionOf(sidebarThread("a", { indicator: "queued-failed" }))).toBe("queue-failed");
    expect(attentionOf(sidebarThread("a", { indicator: "unread-success" }))).toBe("done");
    expect(attentionOf(sidebarThread("a", { indicator: "draft" }))).toBeNull();
  });

  it("orders by urgency then recency and keeps a blocked thread out of Running", () => {
    const groups = groupThreads(
      [
        sidebarThread("done", { indicator: "unread-success", latestAttentionAt: 900 }),
        sidebarThread("failed_old", { indicator: "unread-error", latestAttentionAt: 100 }),
        sidebarThread("failed_new", { indicator: "unread-error", latestAttentionAt: 500 }),
        sidebarThread("asking", { status: "active", runtimeStatus: "active", hasPendingInteraction: true, latestAttentionAt: 50 }),
        sidebarThread("working", { status: "active", runtimeStatus: "active", updatedAt: 10 }),
        sidebarThread("booting", { runtimeStatus: "provisioning", updatedAt: 20 }),
        sidebarThread("idle"),
      ],
      null,
    );
    expect(groups.needsYou.map(({ thread }) => thread.id)).toEqual(["asking", "failed_new", "failed_old", "done"]);
    expect(groups.running.map((thread) => thread.id)).toEqual(["booting", "working"]);
  });

  it("filters to the selected project and skips hidden threads", () => {
    const groups = groupThreads(
      [
        sidebarThread("mine", { indicator: "unread-success" }),
        sidebarThread("other", { indicator: "unread-success", projectId: "proj_b" }),
        sidebarThread("helper", { indicator: "unread-success", isHidden: true }),
      ],
      "proj_a",
    );
    expect(groups.needsYou.map(({ thread }) => thread.id)).toEqual(["mine"]);
  });
});

describe("latestWindows", () => {
  const window = (status: "allowed" | "warning", resetsAtMs: number | null) => ({ label: "Five-hour limit", providerKey: "five_hour", status, resetsAtMs });

  it("keeps each window's newest report and drops ended windows", () => {
    const windows = latestWindows(
      [
        { at: 100, providerId: "claude-code", windows: [window("allowed", 10_000)] },
        { at: 300, providerId: "claude-code", windows: [window("warning", 10_000)] },
        { at: 200, providerId: "claude-code", windows: [window("allowed", 10_000), { label: "Weekly limit", providerKey: "seven_day", status: "allowed", resetsAtMs: 500 }] },
      ],
      1000,
    );
    expect(windows).toEqual([{ key: "claude-code:five_hour", providerId: "claude-code", label: "Five-hour limit", status: "warning", resetsAtMs: 10_000, reportedAt: 300 }]);
  });
});

describe("cursor", () => {
  it("finds the row nearest in height", () => {
    expect(nearestIndex([10, 50, 90], 60)).toBe(1);
    expect(nearestIndex([], 60)).toBeNull();
  });
});

describe("format", () => {
  it("formats spans by their largest units", () => {
    expect(formatSpan(42_000)).toBe("42s");
    expect(formatSpan(12 * 60_000)).toBe("12m");
    expect(formatSpan(130 * 60_000)).toBe("2h 10m");
    expect(formatSpan(11 * 3_600_000 + 60_000)).toBe("11h");
    expect(formatSpan(3 * 86_400_000)).toBe("3d");
    expect(formatSpan(-5)).toBe("0s");
  });

  it("strips bb's branch decoration", () => {
    expect(shortBranch("bb/fix-the-thing-thr_922qxpshrg")).toBe("fix-the-thing");
    expect(shortBranch("main")).toBe("main");
  });
});
