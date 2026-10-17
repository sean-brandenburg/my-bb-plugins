// Runs on the machine that holds the vault. Owns all filesystem access, an
// in-memory link/search index, and the native file watcher that keeps both the
// index and every open editor current when notes change outside bb.
import { promises as fs } from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { hostContract, hostSignals } from "./contract.ts";
import { basename, joinPath } from "./shared/obsidian.ts";
import { calendarEvents } from "./host/calendar.ts";
import { absolutePath, ensureParent, trashFolder } from "./host/confine.ts";
import { errorCode, exists, readNoFollow, sha256, writeNoFollow } from "./host/fs.ts";
import { moveEntry } from "./host/moves.ts";
import { findBacklinks, searchVault } from "./host/queries.ts";
import { addFolderChain, forget, getIndex, refreshFile, resolverFor, serialize } from "./host/vault-index.ts";
import { startWatch, stopWatch } from "./host/watch.ts";

/** "Note.md" → "Note 1.md", "Note 2.md", … for the first name not already in `dir`. */
async function freeName(dir: string, name: string): Promise<string> {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let target = nodePath.join(dir, name);
  for (let attempt = 1; await exists(target); attempt += 1) {
    target = nodePath.join(dir, `${stem} ${attempt}${ext}`);
  }
  return target;
}

export default experimental_defineHostEntry({
  contract: hostContract,
  experimental_signals: hostSignals,
  handlers: {
    async checkVault({ vaultPath }) {
      if (!nodePath.isAbsolute(vaultPath)) {
        return { ok: false, message: "Use an absolute path to the vault folder." };
      }
      let real: string;
      try {
        const stat = await fs.stat(vaultPath);
        if (!stat.isDirectory()) return { ok: false, message: "That path is not a folder." };
        real = await fs.realpath(vaultPath);
      } catch {
        return { ok: false, message: "That folder does not exist on this machine." };
      }
      const home = await fs.realpath(os.homedir()).catch(() => os.homedir());
      if (real === nodePath.parse(real).root || real === home) {
        return { ok: false, message: "Choose the vault folder itself, not the whole disk or home folder." };
      }
      const hasConfig = await exists(nodePath.join(vaultPath, ".obsidian"));
      const hidden = real.split(nodePath.sep).some((segment) => segment.startsWith("."));
      if (hidden && !hasConfig) {
        return { ok: false, message: "That is a hidden folder and has no .obsidian folder, so it doesn't look like a vault." };
      }
      return {
        ok: true,
        message: hasConfig ? null : "No .obsidian folder found; the folder will still open as a vault.",
      };
    },

    async watch({ vaultPath }, context) {
      return { started: await startWatch(vaultPath, context) };
    },

    async tree({ vaultPath }) {
      const index = await getIndex(vaultPath);
      return {
        files: [...index.files.values()].sort((a, b) => a.path.localeCompare(b.path)),
        folders: [...index.folders].sort(),
      };
    },

    async read({ vaultPath, path }) {
      const index = await getIndex(vaultPath);
      const { absolute } = await absolutePath(index, path);
      const { bytes, mtimeMs } = await readNoFollow(absolute);
      return { content: bytes.toString("utf8"), sha256: sha256(bytes), mtimeMs };
    },

    async write({ vaultPath, path, content, expectedSha256 }) {
      const index = await getIndex(vaultPath);
      return serialize(index, async () => {
        const { relative, absolute } = await absolutePath(index, path);
        let currentSha: string | null = null;
        try {
          currentSha = sha256(await fs.readFile(absolute));
        } catch (error) {
          if (errorCode(error) !== "ENOENT") throw error;
        }
        if (expectedSha256 !== undefined && expectedSha256 !== currentSha) {
          return { outcome: "conflict" as const, currentSha256: currentSha };
        }
        // Written in place rather than via rename so the file keeps its
        // creation time, which Obsidian and its plugins surface as "created".
        await writeNoFollow(await ensureParent(index, relative), content);
        await refreshFile(index, relative);
        return { outcome: "written" as const, sha256: sha256(Buffer.from(content, "utf8")) };
      });
    },

    async mkdir({ vaultPath, path }) {
      const index = await getIndex(vaultPath);
      return serialize(index, async () => {
        const { relative, absolute } = await absolutePath(index, path);
        await fs.mkdir(absolute, { recursive: true });
        // Re-check now that the folders exist, in case one resolved through a symlink.
        await absolutePath(index, path);
        addFolderChain(index, relative);
        return { path: relative };
      });
    },

    async move({ vaultPath, from, to, updateLinks }) {
      const index = await getIndex(vaultPath);
      return serialize(index, () => moveEntry(index, from, to, updateLinks));
    },

    async trash({ vaultPath, path }) {
      const index = await getIndex(vaultPath);
      return serialize(index, async () => {
        const source = await absolutePath(index, path);
        const target = await freeName(await trashFolder(index), basename(source.relative));
        await fs.rename(source.absolute, target);
        forget(index, source.relative);
        return { trashedTo: joinPath(".trash", nodePath.basename(target)) };
      });
    },

    async backlinks({ vaultPath, path }) {
      const index = await getIndex(vaultPath);
      return findBacklinks(index.notes, resolverFor(index), path);
    },

    async search({ vaultPath, query, limit }) {
      const index = await getIndex(vaultPath);
      return searchVault(index.files.values(), index.notes, query, limit);
    },

    calendarEvents: ({ from, to }, context) => calendarEvents(from, to, context.experimental_paths),
  },
  dispose: stopWatch,
});
