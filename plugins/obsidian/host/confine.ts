// Keeps every filesystem operation inside the vault, including through symlinks.
import { promises as fs } from "node:fs";
import nodePath from "node:path";
import { normalizePath } from "../shared/obsidian.ts";
import { errorCode, isSymlink } from "./fs.ts";

export interface VaultRoot {
  /** The vault folder as configured, resolved to an absolute path. */
  root: string;
  /** `root` with symlinks resolved. */
  realRoot: string;
}

function isInsideRoot(vault: VaultRoot, real: string): boolean {
  const prefix = vault.realRoot.endsWith(nodePath.sep) ? vault.realRoot : vault.realRoot + nodePath.sep;
  return real === vault.realRoot || real.startsWith(prefix);
}

/** Joins a vault-relative POSIX path onto the root without any confinement check. */
export function joinRoot(vault: VaultRoot, relative: string): string {
  return nodePath.join(vault.root, ...relative.split("/"));
}

/**
 * Maps a vault-relative path to an absolute one, refusing anything outside the
 * vault. Call it inside `serialize` right before the filesystem operation so
 * the check is as close to the use as Node allows.
 */
export async function absolutePath(vault: VaultRoot, relative: string): Promise<{ relative: string; absolute: string }> {
  const normalized = normalizePath(relative);
  const outside = () => new Error(`Path is outside the vault: ${relative}`);
  if (normalized === null || normalized === "") throw outside();
  const absolute = joinRoot(vault, normalized);
  // Resolve symlinks on the deepest existing ancestor so a link can't escape the vault.
  let probe = absolute;
  for (;;) {
    let real: string;
    try {
      real = await fs.realpath(probe);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
      // realpath reports a dangling symlink as missing, but writing through it creates its target.
      if (await isSymlink(probe)) throw outside();
      const parent = nodePath.dirname(probe);
      if (parent === probe) break;
      probe = parent;
      continue;
    }
    if (!isInsideRoot(vault, real)) throw outside();
    break;
  }
  return { relative: normalized, absolute };
}

/** Creates `relative`'s parent folders, then re-validates the chain they now resolve through. */
export async function ensureParent(vault: VaultRoot, relative: string): Promise<string> {
  const { absolute } = await absolutePath(vault, relative);
  await fs.mkdir(nodePath.dirname(absolute), { recursive: true });
  return (await absolutePath(vault, relative)).absolute;
}

/** The vault's .trash folder, refused when it is a symlink or resolves outside the vault. */
export async function trashFolder(vault: VaultRoot): Promise<string> {
  const trashDir = nodePath.join(vault.root, ".trash");
  try {
    const stat = await fs.lstat(trashDir);
    if (!stat.isDirectory()) throw new Error("The vault's .trash is not a real folder; refusing to move files into it.");
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
    await fs.mkdir(trashDir);
  }
  const real = await fs.realpath(trashDir);
  if (real !== nodePath.join(vault.realRoot, ".trash")) throw new Error("The vault's .trash resolves outside the vault.");
  return real;
}
