import { useSyncExternalStore, type CSSProperties } from "react";
import { GLYPH_CLASS, nerdFontState, subscribeNerdFont } from "./detect";

const glyphsRender = () => nerdFontState() === "on";
const serverSnapshot = () => false;

/**
 * Whether Nerd Font glyphs render on this page. False until the page's check finishes, so the first paint shows the
 * fallback. Call it once per list and pass the answer down rather than once per row.
 */
export function useNerdFont(): boolean {
  return useSyncExternalStore(subscribeNerdFont, glyphsRender, serverSnapshot);
}

/** One Nerd Font icon. Without a `label` it is decoration and hidden from screen readers. */
export function Glyph({
  glyph,
  label,
  title,
  className,
  style,
}: {
  glyph: string;
  label?: string;
  title?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className === undefined ? GLYPH_CLASS : `${GLYPH_CLASS} ${className}`}
      style={style}
      title={title}
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      {glyph}
    </span>
  );
}
