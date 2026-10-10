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
  /** `fromKeys` is true when Enter or a key pressed the button rather than a click. */
  onOpen: (path: string, line: number | undefined, fromKeys: boolean) => void;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cx("ob-search-result", className)} style={style}>
      <button type="button" className="ob-search-file" data-nav-row="item" data-path={path} onClick={(event) => onOpen(path, undefined, event.detail === 0)}>
        <span className="truncate font-medium">{isNotePath(path) ? noteTitle(path) : basename(path)}</span>
        {dirname(path) === "" ? null : <span className="truncate text-muted-foreground">{dirname(path)}</span>}
      </button>
      {matches.map((match) => (
        <button key={match.line} type="button" className="ob-search-match" data-nav-row="item" data-path={path} onClick={(event) => onOpen(path, match.line, event.detail === 0)}>
          {match.text}
        </button>
      ))}
    </div>
  );
}
