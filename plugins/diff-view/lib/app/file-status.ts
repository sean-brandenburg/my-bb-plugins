import type { DiffFile } from "../types";

export interface StatusMark {
  glyph: "diffAdded" | "diffRemoved" | "diffRenamed";
  letter: string;
  label: string;
  tone: string;
}

const ADDED = "text-emerald-600 dark:text-emerald-400";
const REMOVED = "text-red-600 dark:text-red-400";
const MOVED = "text-sky-600 dark:text-sky-400";

/** How a file's change is marked; null for plain modifications, which are the default and need no mark. */
export function statusMark(file: DiffFile): StatusMark | null {
  switch (file.status) {
    case "added":
      return { glyph: "diffAdded", letter: "A", label: "Added", tone: ADDED };
    case "removed":
      return { glyph: "diffRemoved", letter: "D", label: "Deleted", tone: REMOVED };
    case "renamed":
      return { glyph: "diffRenamed", letter: "R", label: file.previousPath === null ? "Renamed" : `Renamed from ${file.previousPath}`, tone: MOVED };
    case "copied":
      return { glyph: "diffRenamed", letter: "C", label: file.previousPath === null ? "Copied" : `Copied from ${file.previousPath}`, tone: MOVED };
    default:
      return null;
  }
}
