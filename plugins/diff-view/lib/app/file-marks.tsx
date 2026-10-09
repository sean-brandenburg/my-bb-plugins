import type { DiffFile } from "../types";
import { statusMark } from "./file-status";
import { GLYPH, Glyph, fileGlyph } from "./ui/nerd-font";
import { cn } from "./utils";

/**
 * One Nerd Font icon per file: what happened to it when it was added, deleted, renamed, or copied, and otherwise its
 * file type. Muted, so the +/− counts stay the only colour on the row.
 */
export function FileGlyph({ file, className }: { file: DiffFile; className?: string }) {
  const mark = statusMark(file);
  const glyph = mark === null ? fileGlyph(file.path) : GLYPH[mark.glyph];
  return <Glyph glyph={glyph} label={mark?.label} title={mark?.label} className={cn("text-muted-foreground", className)} />;
}

/** Without a Nerd Font: git's status letter for files that weren't just modified. */
export function FileStatusLetter({ file }: { file: DiffFile }) {
  const mark = statusMark(file);
  if (mark === null) return null;
  return (
    <span role="img" aria-label={mark.label} title={mark.label} className="shrink-0 font-mono text-[10px] font-semibold leading-none text-muted-foreground">
      {mark.letter}
    </span>
  );
}
