// The vault side of the plugin server: proxies vault RPCs to the host worker on
// the bb server machine, keeps its file watch alive, and relays change signals.
import nodePath from "node:path";
import type {
  BbPluginApi,
  PluginRpcHandlers,
  PluginRpcResult,
  PluginSettingDescriptor,
  PluginSettingsHandle,
} from "@get-bb/plugin-sdk";
import type { z } from "zod";
import { hostContract, hostSignals, VAULT_CHANGED, type VaultChangedPayload } from "../contract.ts";
import type { vaultRpcContract } from "../rpc-contract.ts";
import { errorMessage } from "../shared/errors.ts";
import type { VaultAccess } from "./daily.ts";

export const VAULT_SETTINGS = {
  vaultPath: {
    type: "string",
    label: "Vault folder",
    description: "Absolute path to the Obsidian vault on the bb server machine.",
    default: "",
  },
  updateLinksOnRename: {
    type: "boolean",
    label: "Update links when renaming or moving notes",
    default: true,
  },
} satisfies Record<string, PluginSettingDescriptor>;

const WATCH_RECONCILE_MS = 60_000;
const PREVIEW_TTL_MS = 60 * 60 * 1000;
const SEARCH_LIMIT = 100;
const MOVE_TIMEOUT_MS = 120_000;
/** Long enough for the user to answer macOS's calendar permission prompt. */
const CALENDAR_TIMEOUT_MS = 150_000;

type HostContract = typeof hostContract;
/** Every host method but these acts on the configured vault. */
type VaultMethod = Exclude<keyof HostContract & string, "checkVault" | "calendarEvents">;
type VaultMethodInput<M extends VaultMethod> = Omit<z.input<HostContract[M]["input"]>, "vaultPath">;

/** `status` minus the daily-note fields, which the daily module supplies. */
type VaultStatus = Pick<PluginRpcResult<(typeof vaultRpcContract)["status"]>, "vaultPath" | "vaultName">;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export function createVault(bb: BbPluginApi, settings: PluginSettingsHandle<typeof VAULT_SETTINGS>) {
  const host = bb.hosts.experimental_client({
    contract: hostContract,
    experimental_signals: hostSignals,
  });

  async function hostId(): Promise<string> {
    const { primaryHostId } = await bb.sdk.system.config();
    if (primaryHostId === null) throw new Error("The bb server machine is not connected yet.");
    return primaryHostId;
  }

  async function vaultPath(): Promise<string> {
    const { vaultPath } = await settings.get();
    if (vaultPath.trim() === "") throw new Error("Choose a vault folder first.");
    return vaultPath;
  }

  async function callVault<M extends VaultMethod>(
    method: M,
    input: VaultMethodInput<M>,
    options: { timeoutMs?: number } = {},
  ): Promise<PluginRpcResult<HostContract[M]>> {
    const fullInput = { vaultPath: await vaultPath(), ...input } as z.input<HostContract[M]["input"]>;
    return host.call(method, fullInput, { hostId: await hostId(), ...options });
  }

  function publish(payload: VaultChangedPayload) {
    bb.realtime.publish(VAULT_CHANGED, payload);
  }

  async function ensureWatch(): Promise<void> {
    const { vaultPath } = await settings.get();
    if (vaultPath.trim() === "") return;
    const { started } = await host.call("watch", { vaultPath }, { hostId: await hostId() });
    // A new watch (first start, worker restart, recovered watcher) may follow missed changes.
    if (started) publish({ paths: [], structural: true });
  }

  function reportWatchFailure(error: unknown) {
    bb.log.warn(`Vault watch failed: ${errorMessage(error)}`);
  }

  host.experimental_onSignal("changed", async ({ payload }) => {
    const { vaultPath } = await settings.get();
    if (payload.vaultPath !== vaultPath) return;
    publish({ paths: payload.paths, structural: payload.structural });
  });
  host.experimental_onWorkerExit(() => {
    ensureWatch().catch(reportWatchFailure);
  });
  settings.onChange((next, previous) => {
    if (next.vaultPath === previous.vaultPath) return;
    ensureWatch().catch(reportWatchFailure);
    publish({ paths: [], structural: true });
  });

  bb.background.service("vault-watch", {
    async start(signal) {
      while (!signal.aborted) {
        await ensureWatch().catch(reportWatchFailure);
        await sleep(WATCH_RECONCILE_MS, signal);
      }
    },
  });

  const access: VaultAccess = {
    vaultPath,
    hostId,
    async read(path) {
      try {
        return await callVault("read", { path });
      } catch (error) {
        if (/ENOENT|no such file/i.test(errorMessage(error))) return null;
        throw error;
      }
    },
    write: (path, content, expectedSha256) => callVault("write", { path, content, expectedSha256 }),
    tree: () => callVault("tree", {}),
    calendarEvents: async (from, to) => host.call("calendarEvents", { from, to }, { hostId: await hostId(), timeoutMs: CALENDAR_TIMEOUT_MS }),
  };

  async function status(): Promise<VaultStatus> {
    const trimmed = (await settings.get()).vaultPath.trim();
    return {
      vaultPath: trimmed === "" ? null : trimmed,
      vaultName: trimmed === "" ? null : nodePath.basename(trimmed),
    };
  }

  const rpcHandlers: Omit<PluginRpcHandlers<typeof vaultRpcContract>, "status"> = {
    async configure({ vaultPath }) {
      const result = await host.call("checkVault", { vaultPath }, { hostId: await hostId() });
      if (result.ok) await settings.experimental_set({ vaultPath: nodePath.resolve(vaultPath) });
      return result;
    },
    tree: () => callVault("tree", {}),
    read: ({ path }) => callVault("read", { path }),
    write: ({ path, content, expectedSha256 }) => callVault("write", { path, content, expectedSha256 }),
    mkdir: ({ path }) => callVault("mkdir", { path }),
    async move({ from, to, updateLinks }) {
      const { updateLinksOnRename } = await settings.get();
      return callVault("move", { from, to, updateLinks: updateLinks && updateLinksOnRename }, { timeoutMs: MOVE_TIMEOUT_MS });
    },
    trash: ({ path }) => callVault("trash", { path }),
    backlinks: ({ path }) => callVault("backlinks", { path }),
    search: ({ query }) => callVault("search", { query, limit: SEARCH_LIMIT }),
    async previewBase() {
      return bb.sdk.files.createPreview({
        hostId: await hostId(),
        rootPath: await vaultPath(),
        ttlMs: PREVIEW_TTL_MS,
      });
    },
  };

  return {
    access,
    status,
    rpcHandlers,
    search: (query: string, limit: number) => callVault("search", { query, limit }),
  };
}

export type Vault = ReturnType<typeof createVault>;
