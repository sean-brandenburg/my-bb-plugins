import type { DiffFile } from "../types";

export interface StatusMark {
  glyph: "diffAdded" | "diffRemoved" | "diffRenamed";
  letter: string;
  label: string;
}

/** How a file's change is marked; null for plain modifications, which are the default and need no mark. */
export function statusMark(file: DiffFile): StatusMark | null {
  switch (file.status) {
    case "added":
      return { glyph: "diffAdded", letter: "A", label: "Added" };
    case "removed":
      return { glyph: "diffRemoved", letter: "D", label: "Deleted" };
    case "renamed":
      return { glyph: "diffRenamed", letter: "R", label: file.previousPath === null ? "Renamed" : `Renamed from ${file.previousPath}` };
    case "copied":
      return { glyph: "diffRenamed", letter: "C", label: file.previousPath === null ? "Copied" : `Copied from ${file.previousPath}` };
    default:
      return null;
  }
}
