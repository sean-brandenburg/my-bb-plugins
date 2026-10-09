// Renaming or moving a file or folder, and rewriting the links that pointed into it.
import { promises as fs } from "node:fs";
import { createResolver, isNotePath, rewriteLinks, type LinkResolver } from "../shared/obsidian.ts";
import { absolutePath, ensureParent } from "./confine.ts";
import { errorCode, sha256, writeNoFollow } from "./fs.ts";
import { addFolderChain, forget, refreshFile, resolverFor, walk, type VaultIndex } from "./vault-index.ts";

/** Old path → new path for every indexed file a move of `from` to `to` relocates. */
export function collectMoves(files: ReadonlyMap<string, unknown>, from: string, to: string): Map<string, string> {
  const moves = new Map<string, string>();
  if (files.has(from)) {
    moves.set(from, to);
    return moves;
  }
  const prefix = from + "/";
  for (const path of files.keys()) {
    if (path.startsWith(prefix)) moves.set(path, to + "/" + path.slice(prefix.length));
  }
  return moves;
}

/**
 * Rewrites a note's links after `moves`, given the resolvers from before and
 * after. `notePath` is the note's path after the move. Returns null when
 * nothing in the note needs to change.
 */
export function movedLinkRewriter(moves: ReadonlyMap<string, string>, oldResolver: LinkResolver, newResolver: LinkResolver) {
  const reverse = new Map([...moves].map(([oldPath, newPath]) => [newPath, oldPath]));
  return (notePath: string, content: string): string | null =>
    rewriteLinks({
      content,
      oldSourcePath: reverse.get(notePath) ?? notePath,
      newSourcePath: notePath,
      oldResolver,
      newResolver,
      remap: moves,
    });
}

/** Moves a file or folder inside the vault. Call inside `serialize`. */
export async function moveEntry(index: VaultIndex, from: string, to: string, updateLinks: boolean) {
  const source = await absolutePath(index, from);
  const destination = await absolutePath(index, to);
  let sourceStat;
  try {
    sourceStat = await fs.lstat(source.absolute);
  } catch (error) {
    if (errorCode(error) === "ENOENT") throw new Error(`${from} does not exist`);
    throw error;
  }
  const destinationStat = await fs.lstat(destination.absolute).catch((error) => {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  });
  // A case-only rename on a case-insensitive disk sees the source as the destination;
  // anything else already there is a different file that rename would replace.
  const sameEntry = destinationStat !== null && destinationStat.ino === sourceStat.ino && destinationStat.dev === sourceStat.dev;
  if (destinationStat !== null && !sameEntry) throw new Error(`${to} already exists`);
  const isFile = !sourceStat.isDirectory();
  const moves = collectMoves(index.files, source.relative, destination.relative);
  const oldResolver = resolverFor(index);
  const newResolver = createResolver(
    [...index.files.keys()].map((path) => moves.get(path) ?? path),
  );

  await fs.rename(source.absolute, await ensureParent(index, destination.relative));
  forget(index, source.relative);
  if (isFile) {
    await refreshFile(index, destination.relative);
  } else {
    addFolderChain(index, destination.relative);
    await walk(index, destination.relative);
  }

  const updatedNotes: string[] = [];
  const skippedNotes: string[] = [];
  if (updateLinks) {
    const rewrite = movedLinkRewriter(moves, oldResolver, newResolver);
    for (const notePath of [...index.files.keys()].filter(isNotePath)) {
      const cached = index.notes.get(notePath);
      // Large notes aren't cached in memory, so they're read only here.
      if (cached !== undefined && rewrite(notePath, cached.content) === null) continue;
      try {
        const { absolute } = await absolutePath(index, notePath);
        const onDisk = await fs.readFile(absolute);
        // Skip notes edited since they were indexed rather than clobber them.
        if (cached !== undefined && sha256(onDisk) !== cached.sha256) {
          skippedNotes.push(notePath);
          continue;
        }
        const rewritten = rewrite(notePath, onDisk.toString("utf8"));
        if (rewritten === null) continue;
        await writeNoFollow(absolute, rewritten);
        await refreshFile(index, notePath);
        updatedNotes.push(notePath);
      } catch {
        skippedNotes.push(notePath);
      }
    }
  }
  return { path: destination.relative, updatedNotes, skippedNotes };
}
