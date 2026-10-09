import type { DiffFile } from "../../types";

export interface FileTreeDir {
  name: string;
  path: string;
  dirs: FileTreeDir[];
  files: DiffFile[];
  additions: number;
  deletions: number;
}

/** Nest files by directory, then fold single-child directory chains into one row (`src/server/handlers`). */
export function buildFileTree(files: DiffFile[]): FileTreeDir {
  const root: FileTreeDir = { name: "", path: "", dirs: [], files: [], additions: 0, deletions: 0 };
  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      let child = node.dirs.find((dir) => dir.name === part);
      if (child === undefined) {
        child = { name: part, path: node.path === "" ? part : `${node.path}/${part}`, dirs: [], files: [], additions: 0, deletions: 0 };
        node.dirs.push(child);
      }
      node = child;
    }
    node.files.push(file);
  }
  const fold = (node: FileTreeDir): FileTreeDir => {
    let current = node;
    while (current.dirs.length === 1 && current.files.length === 0 && current !== root) {
      const only = current.dirs[0]!;
      current = { ...only, name: `${current.name}/${only.name}` };
    }
    current.dirs = current.dirs.map(fold).sort((a, b) => a.name.localeCompare(b.name));
    current.files.sort((a, b) => a.path.localeCompare(b.path));
    current.additions = current.files.reduce((sum, file) => sum + file.additions, 0) + current.dirs.reduce((sum, dir) => sum + dir.additions, 0);
    current.deletions = current.files.reduce((sum, file) => sum + file.deletions, 0) + current.dirs.reduce((sum, dir) => sum + dir.deletions, 0);
    return current;
  };
  return fold(root);
}
