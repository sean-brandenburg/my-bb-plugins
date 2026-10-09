// In-memory index of a vault: every visible file and folder, plus the content
// and parsed links of each note small enough to cache.
import { promises as fs } from "node:fs";
import nodePath from "node:path";
import type { FileEntry } from "../contract.ts";
import { createResolver, dirname, isNotePath, joinPath, parseLinks, type LinkResolver, type ParsedLink } from "../shared/obsidian.ts";
import { joinRoot, type VaultRoot } from "./confine.ts";
import { errorCode, sha256 } from "./fs.ts";

const MAX_INDEXED_NOTE_BYTES = 2 * 1024 * 1024;
const WALK_CONCURRENCY = 32;
const UNREADABLE_DIR_CODES = ["ENOENT", "ENOTDIR", "EACCES", "EPERM"];

export interface NoteRecord {
  content: string;
  sha256: string;
  links: ParsedLink[];
}

export interface VaultIndex extends VaultRoot {
  files: Map<string, FileEntry>;
  folders: Set<string>;
  /** Notes over MAX_INDEXED_NOTE_BYTES are listed in `files` but not cached here. */
  notes: Map<string, NoteRecord>;
  resolver: LinkResolver | null;
  /** Serializes mutations so compare-and-swap checks and index updates don't interleave. */
  queue: Promise<unknown>;
}

/** Obsidian hides dot-files and dot-folders; node_modules is never vault content. */
export function isHiddenName(name: string): boolean {
  return name.startsWith(".") || name === "node_modules";
}

export function isHiddenPath(relative: string): boolean {
  return relative.split("/").some(isHiddenName);
}

export function serialize<T>(index: VaultIndex, work: () => Promise<T>): Promise<T> {
  const next = index.queue.then(work, work);
  index.queue = next.catch(() => undefined);
  return next;
}

export function resolverFor(index: VaultIndex): LinkResolver {
  index.resolver ??= createResolver(index.files.keys());
  return index.resolver;
}

async function indexNote(index: VaultIndex, relative: string, absolute: string, size: number): Promise<void> {
  if (size > MAX_INDEXED_NOTE_BYTES) {
    index.notes.delete(relative);
    return;
  }
  const bytes = await fs.readFile(absolute);
  const content = bytes.toString("utf8");
  index.notes.set(relative, { content, sha256: sha256(bytes), links: parseLinks(content) });
}

export function addFolderChain(index: VaultIndex, folder: string): void {
  let current = folder;
  while (current !== "" && !index.folders.has(current)) {
    index.folders.add(current);
    current = dirname(current);
  }
}

async function mapLimit<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await work(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Lists visible folders and files under a folder one directory at a time to keep descriptor use flat. */
async function listTree(root: string, relativeDir: string): Promise<{ folders: string[]; files: string[] }> {
  const folders: string[] = [];
  const files: string[] = [];
  const pending = [relativeDir];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    let entries;
    try {
      entries = await fs.readdir(dir === "" ? root : nodePath.join(root, ...dir.split("/")), { withFileTypes: true });
    } catch (error) {
      if (UNREADABLE_DIR_CODES.includes(errorCode(error) ?? "")) continue;
      throw error;
    }
    for (const entry of entries) {
      if (isHiddenName(entry.name)) continue;
      const relative = joinPath(dir, entry.name);
      if (entry.isDirectory()) {
        folders.push(relative);
        pending.push(relative);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  }
  return { folders, files };
}

/** Indexes everything under a folder ("" for the whole vault). */
export async function walk(index: VaultIndex, relativeDir: string): Promise<void> {
  const { folders, files } = await listTree(index.root, relativeDir);
  for (const folder of folders) index.folders.add(folder);
  await mapLimit(files, WALK_CONCURRENCY, async (file) => {
    try {
      await refreshFile(index, file);
    } catch {
      // One unreadable file shouldn't take the rest of the vault down with it.
      forget(index, file);
    }
  });
}

/** Re-reads one file into the index. Returns false when it is gone or not indexable. */
export async function refreshFile(index: VaultIndex, relative: string): Promise<boolean> {
  if (isHiddenPath(relative)) return false;
  const absolute = joinRoot(index, relative);
  let stat;
  try {
    stat = await fs.lstat(absolute);
    if (!stat.isFile()) return false;
    if (isNotePath(relative)) await indexNote(index, relative, absolute, stat.size);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
    forget(index, relative);
    return false;
  }
  if (!index.files.has(relative)) index.resolver = null;
  index.files.set(relative, { path: relative, mtimeMs: stat.mtimeMs, size: stat.size });
  addFolderChain(index, dirname(relative));
  return true;
}

/** Drops a file, or a folder and everything under it. Returns whether anything was indexed there. */
export function forget(index: VaultIndex, relative: string): boolean {
  let removed = false;
  const prefix = relative + "/";
  for (const path of [...index.files.keys()]) {
    if (path === relative || path.startsWith(prefix)) {
      index.files.delete(path);
      index.notes.delete(path);
      removed = true;
    }
  }
  for (const folder of [...index.folders]) {
    if (folder === relative || folder.startsWith(prefix)) {
      index.folders.delete(folder);
      removed = true;
    }
  }
  if (removed) index.resolver = null;
  return removed;
}

/** Applies one watcher change. Returns whether the tree's shape changed. */
export async function refreshPath(index: VaultIndex, relative: string): Promise<boolean> {
  const absolute = joinRoot(index, relative);
  let stat;
  try {
    stat = await fs.lstat(absolute);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
    return forget(index, relative);
  }
  if (stat.isDirectory()) {
    if (index.folders.has(relative)) return false;
    addFolderChain(index, relative);
    await walk(index, relative);
    index.resolver = null;
    return true;
  }
  if (!stat.isFile()) return forget(index, relative);
  const existed = index.files.has(relative);
  const present = await refreshFile(index, relative);
  return existed !== present;
}

function emptyIndex(root: string, realRoot: string): VaultIndex {
  return { root, realRoot, files: new Map(), folders: new Set(), notes: new Map(), resolver: null, queue: Promise.resolve() };
}

/** Rescans into fresh maps and swaps them in, so readers never see a half-built index. */
export async function rebuild(index: VaultIndex): Promise<void> {
  const fresh = emptyIndex(index.root, index.realRoot);
  await walk(fresh, "");
  index.files = fresh.files;
  index.folders = fresh.folders;
  index.notes = fresh.notes;
  index.resolver = null;
}

async function buildIndex(vaultPath: string): Promise<VaultIndex> {
  const root = nodePath.resolve(vaultPath);
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${vaultPath}`);
  const index = emptyIndex(root, await fs.realpath(root));
  await walk(index, "");
  return index;
}

const indexes = new Map<string, Promise<VaultIndex>>();

/** The index for a vault, built on first use; a failed build is retried on the next call. */
export function getIndex(vaultPath: string): Promise<VaultIndex> {
  let pending = indexes.get(vaultPath);
  if (pending === undefined) {
    pending = buildIndex(vaultPath);
    indexes.set(vaultPath, pending);
    pending.catch(() => indexes.delete(vaultPath));
  }
  return pending;
}

export function hasIndex(vaultPath: string): boolean {
  return indexes.has(vaultPath);
}

export function dropIndex(vaultPath: string): void {
  indexes.delete(vaultPath);
}
