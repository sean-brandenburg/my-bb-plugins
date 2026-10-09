import type { DiffFile } from "../types";
import { statusMark } from "./file-status";
import { GLYPH, Glyph, fileGlyph } from "./ui/nerd-font";
import { cn } from "./utils";

/** Added, deleted, renamed: a diff glyph, or the git status letter without a Nerd Font. */
export function FileStatusMark({ file, nerdFont, className }: { file: DiffFile; nerdFont: boolean; className?: string }) {
  const mark = statusMark(file);
  if (mark === null) return null;
  return nerdFont ? (
    <Glyph glyph={GLYPH[mark.glyph]} label={mark.label} title={mark.label} className={cn("text-[12px]", mark.tone, className)} />
  ) : (
    <span role="img" aria-label={mark.label} title={mark.label} className={cn("shrink-0 font-mono text-[10px] font-semibold leading-none", mark.tone, className)}>
      {mark.letter}
    </span>
  );
}

/** The file type's icon in its brand colour; only drawn with a Nerd Font, since without one the name says the same. */
export function FileTypeGlyph({ path, className }: { path: string; className?: string }) {
  const { glyph, color } = fileGlyph(path);
  return <Glyph glyph={glyph} className={cn(color === null && "text-muted-foreground", className)} style={color === null ? undefined : { color }} />;
}
