export const GLYPHS_AUTOMATIC = "Automatic";
export const GLYPHS_ALWAYS = "Always";
export const GLYPHS_NEVER = "Never";

export const settingDescriptors = {
  glyphs: {
    type: "select" as const,
    label: "Nerd Font icons",
    description:
      "Automatic draws Nerd Font icons when one is installed and falls back to the plain icons and labels when not. Always and Never skip the check.",
    options: [GLYPHS_AUTOMATIC, GLYPHS_ALWAYS, GLYPHS_NEVER],
    default: GLYPHS_AUTOMATIC,
  },
};

/** The `data-nerd-font` value a setting forces, or null to let the page's check decide. */
export function forcedGlyphs(value: unknown): "on" | "off" | null {
  return value === GLYPHS_ALWAYS ? "on" : value === GLYPHS_NEVER ? "off" : null;
}
