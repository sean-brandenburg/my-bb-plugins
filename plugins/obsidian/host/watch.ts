// The native file watch that keeps the index, and every open editor, current
// when notes change outside bb. One vault is watched at a time.
import nodePath from "node:path";
import type { ExperimentalHostRpcContext, ExperimentalHostWatchSubscription } from "@get-bb/plugin-sdk";
import type { hostSignals } from "../contract.ts";
import { normalizePath } from "../shared/obsidian.ts";
import {
  dropIndex,
  forget,
  getIndex,
  hasIndex,
  isHiddenPath,
  rebuild,
  refreshPath,
  serialize,
  type VaultIndex,
} from "./vault-index.ts";

const IGNORED_DIRS = [".obsidian", ".git", ".trash", "node_modules"];
const DEBOUNCE_MS = 150;
const MAX_WAIT_MS = 1000;

function toRelative(index: VaultIndex, changedPath: string): string | null {
  if (!nodePath.isAbsolute(changedPath)) return normalizePath(changedPath.split(nodePath.sep).join("/"));
  for (const root of [index.root, index.realRoot]) {
    if (changedPath.startsWith(root + nodePath.sep)) {
      return normalizePath(changedPath.slice(root.length + 1).split(nodePath.sep).join("/"));
    }
  }
  return null;
}

interface WatchState {
  vaultPath: string;
  ready: Promise<ExperimentalHostWatchSubscription>;
}

let watchState: WatchState | null = null;

/**
 * Starts (or joins) the watch for `vaultPath`. Resolves true when this call
 * created a new watch, which means changes may have been missed before it.
 */
export async function startWatch(
  vaultPath: string,
  context: ExperimentalHostRpcContext<typeof hostSignals>,
): Promise<boolean> {
  if (watchState?.vaultPath === vaultPath) {
    await watchState.ready;
    return false;
  }
  const previous = watchState;
  const state: WatchState = { vaultPath, ready: Promise.resolve(null as never) };
  const emit = (paths: string[], structural: boolean) =>
    context.experimental_emitSignal("changed", { vaultPath, paths, structural }).catch(() => undefined);

  state.ready = (async () => {
    if (previous !== null) {
      dropIndex(previous.vaultPath);
      await (await previous.ready.catch(() => null))?.dispose();
    }
    const root = nodePath.resolve(vaultPath);
    // Subscribe before indexing so nothing changes unobserved between the scan and the watch.
    const hadIndex = hasIndex(vaultPath);
    const subscription = await context.experimental_watch(
      { rootPath: root, ignoredPaths: IGNORED_DIRS, debounceMs: DEBOUNCE_MS, maxWaitMs: MAX_WAIT_MS },
      async (event) => {
        if (watchState !== state) return;
        const index = await getIndex(vaultPath);
        if (event.kind === "watch-error") {
          // Drop the watch so the server's reconcile loop starts a fresh one with a rescan.
          watchState = null;
          void subscription.dispose();
          return;
        }
        if (event.kind === "rescan-required") {
          await serialize(index, () => rebuild(index)).catch(() => undefined);
          await emit([], true);
          return;
        }
        const paths = new Set<string>();
        for (const change of event.changes) {
          const relative = toRelative(index, change.path);
          if (relative !== null && relative !== "" && !isHiddenPath(relative)) paths.add(relative);
        }
        if (paths.size === 0) return;
        const structural = await serialize(index, async () => {
          let changedShape = false;
          for (const path of paths) {
            try {
              if (await refreshPath(index, path)) changedShape = true;
            } catch {
              changedShape = forget(index, path) || changedShape;
            }
          }
          return changedShape;
        });
        await emit([...paths], structural);
      },
    );
    const index = await getIndex(vaultPath);
    if (hadIndex) await serialize(index, () => rebuild(index));
    return subscription;
  })();
  watchState = state;
  state.ready.catch(() => {
    if (watchState === state) watchState = null;
  });
  await state.ready;
  return true;
}

export async function stopWatch(): Promise<void> {
  const state = watchState;
  watchState = null;
  await (await state?.ready.catch(() => null))?.dispose();
}
