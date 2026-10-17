import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { WorktreeRow } from "../rpc-contract.js";
import { canCleanUp } from "../worktree.js";

export const MAX_ROWS = 50;
const CACHE_MS = 60_000;
const STATUS_CONCURRENCY = 4;

export interface WorktreeEnvironment {
  id: string;
  projectId: string;
  branchName: string | null;
  path: string;
  updatedAt: number;
}

export interface WorkingTree {
  state: string;
  files: number;
  insertions: number;
  deletions: number;
}

export interface ThreadRef {
  id: string;
  environmentId: string | null;
  title: string;
  updatedAt: number;
  archived: boolean;
  hidden: boolean;
  originPluginId: string | null;
}

export interface HeldWorktrees {
  pluginId: string | null;
  projectId: string;
  count: number;
}

export interface WorktreeSummary {
  rows: WorktreeRow[];
  held: HeldWorktrees[];
}

/**
 * The worktrees worth a look: ones with uncommitted changes, and ones no live thread uses, which
 * can be cleaned up. Changed ones come first, then unused ones, longest idle first. A worktree
 * whose only live threads are hidden belongs to the plugin that spawned them (kanban keeps one
 * per review), so it is counted under `held` instead of offered for cleanup.
 */
export function summarizeWorktrees(
  environments: readonly WorktreeEnvironment[],
  trees: ReadonlyMap<string, WorkingTree | null>,
  threads: readonly ThreadRef[],
): WorktreeSummary {
  const held = new Map<string, HeldWorktrees>();
  const byEnvironment = new Map<string, ThreadRef[]>();
  for (const thread of threads) {
    if (thread.environmentId === null) continue;
    const list = byEnvironment.get(thread.environmentId) ?? [];
    list.push(thread);
    byEnvironment.set(thread.environmentId, list);
  }
  const rows: WorktreeRow[] = [];
  for (const environment of environments) {
    const own = [...(byEnvironment.get(environment.id) ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);
    const live = own.filter((thread) => !thread.archived);
    const visible = live.filter((thread) => !thread.hidden);
    const unused = live.length === 0;
    const tree = trees.get(environment.id) ?? null;
    const state: WorktreeRow["tree"] = tree === null ? "unknown" : tree.state === "clean" ? "clean" : "dirty";
    if (!unused && visible.length === 0 && state !== "dirty") {
      const pluginId = live[0]!.originPluginId;
      const key = `${pluginId}:${environment.projectId}`;
      const entry = held.get(key) ?? { pluginId, projectId: environment.projectId, count: 0 };
      entry.count += 1;
      held.set(key, entry);
      continue;
    }
    if (!unused && state !== "dirty") continue;
    const thread = visible[0] ?? live[0] ?? own[0] ?? null;
    rows.push({
      environmentId: environment.id,
      projectId: environment.projectId,
      branchName: environment.branchName,
      path: environment.path,
      tree: state,
      changedFiles: tree?.files ?? 0,
      insertions: tree?.insertions ?? 0,
      deletions: tree?.deletions ?? 0,
      unused,
      thread: thread === null ? null : { id: thread.id, title: thread.title, archived: thread.archived },
      lastActiveAt: Math.max(environment.updatedAt, thread?.updatedAt ?? 0),
    });
  }
  const rank = (row: WorktreeRow) => (row.tree === "dirty" ? 0 : 1);
  rows.sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? b.lastActiveAt - a.lastActiveAt : a.lastActiveAt - b.lastActiveAt));
  return { rows, held: [...held.values()] };
}

async function mapLimited<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

type Sdk = BbPluginApi["sdk"];

async function listWorktrees(sdk: Sdk): Promise<WorktreeEnvironment[]> {
  const environments = await sdk.environments.list({ environmentProviderId: "git-worktree" });
  return environments
    .filter((environment) => environment.lifecycle.phase === "active" && environment.workspaceProvisionType === "managed-worktree")
    .flatMap((environment) =>
      environment.path === null
        ? []
        : [{ id: environment.id, projectId: environment.projectId, branchName: environment.branchName ?? null, path: environment.path, updatedAt: environment.updatedAt }],
    );
}

async function readTree(sdk: Sdk, environmentId: string): Promise<WorkingTree | null> {
  try {
    const status = await sdk.environments.status({ environmentId });
    if (status.outcome !== "available") return null;
    const tree = status.workspace.workingTree;
    return { state: tree.state, files: tree.files.length, insertions: tree.insertions, deletions: tree.deletions };
  } catch {
    return null;
  }
}

async function listThreads(sdk: Sdk): Promise<ThreadRef[]> {
  const [live, archived] = await Promise.all([
    sdk.threads.list({ includeHidden: true }),
    sdk.threads.list({ includeHidden: true, archived: true }),
  ]);
  const ref = (archivedList: boolean) => (thread: (typeof live)[number]): ThreadRef => ({
    id: thread.id,
    environmentId: thread.environmentId ?? null,
    title: thread.title ?? thread.titleFallback ?? thread.id,
    updatedAt: thread.updatedAt,
    archived: archivedList || thread.archivedAt !== null,
    hidden: thread.visibility === "hidden",
    originPluginId: thread.originPluginId ?? null,
  });
  return [...live.map(ref(false)), ...archived.map(ref(true))];
}

export interface WorktreeService {
  list(refresh: boolean): Promise<{ rows: WorktreeRow[]; total: number; held: HeldWorktrees[]; checkedAt: number }>;
  cleanUp(environmentId: string): Promise<void>;
}

export function createWorktreeService(bb: BbPluginApi): WorktreeService {
  let cached: { at: number; result: ReturnType<WorktreeService["list"]> } | null = null;

  const compute = async () => {
    const [environments, threads] = await Promise.all([listWorktrees(bb.sdk), listThreads(bb.sdk)]);
    const trees = await mapLimited(environments, STATUS_CONCURRENCY, (environment) => readTree(bb.sdk, environment.id));
    const { rows, held } = summarizeWorktrees(environments, new Map(environments.map((environment, index) => [environment.id, trees[index]!])), threads);
    return { rows: rows.slice(0, MAX_ROWS), total: rows.length, held, checkedAt: Date.now() };
  };

  const list = (refresh: boolean) => {
    if (refresh || cached === null || Date.now() - cached.at > CACHE_MS) {
      const result = compute();
      const entry = { at: Date.now(), result };
      cached = entry;
      result.catch(() => {
        if (cached === entry) cached = null;
      });
    }
    return cached.result;
  };

  // Rechecks on the server rather than trusting the row the page showed, which can be a minute old.
  const cleanUp = async (environmentId: string) => {
    const environment = (await listWorktrees(bb.sdk)).find((candidate) => candidate.id === environmentId);
    if (environment === undefined) throw new Error("Not an active bb-managed worktree.");
    const [threads, tree] = await Promise.all([listThreads(bb.sdk), readTree(bb.sdk, environmentId)]);
    const [row] = summarizeWorktrees([environment], new Map([[environmentId, tree]]), threads).rows;
    if (row === undefined || !canCleanUp(row)) {
      throw new Error(row?.tree === "dirty" ? "The worktree has uncommitted changes." : "A live thread still uses the worktree.");
    }
    await bb.sdk.environments.experimental_cleanup({ environmentId });
    bb.log.info(`cleaned up worktree ${environmentId} at ${environment.path}`);
    cached = null;
  };

  return { list, cleanUp };
}
