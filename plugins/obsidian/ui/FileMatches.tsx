import type { CSSProperties } from "react";
import { cx } from "bb-motion";
import { basename, dirname, isNotePath, noteTitle } from "../shared/obsidian";

/** A file with some of its matching lines, as search results and backlinks list them. */
export function FileMatches({
  path,
  matches,
  onOpen,
  className,
  style,
}: {
  path: string;
  matches: readonly { line: number; text: string }[];
  onOpen: (path: string, line?: number) => void;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cx("ob-search-result", className)} style={style}>
      <button type="button" className="ob-search-file" onClick={() => onOpen(path)}>
        <span className="truncate font-medium">{isNotePath(path) ? noteTitle(path) : basename(path)}</span>
        {dirname(path) === "" ? null : <span className="truncate text-muted-foreground">{dirname(path)}</span>}
      </button>
      {matches.map((match) => (
        <button key={match.line} type="button" className="ob-search-match" onClick={() => onOpen(path, match.line)}>
          {match.text}
        </button>
      ))}
    </div>
  );
}
