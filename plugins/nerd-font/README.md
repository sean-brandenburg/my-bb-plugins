# Nerd Font glyphs

Lets the plugins here draw [Nerd Font](https://www.nerdfonts.com) icons where they fit: file-type icons and
added/deleted/renamed marks in diff-view, PR state, CI, and Jira status glyphs on kanban cards, and a
glyph-only model and effort in the composer status bar. Without a Nerd Font each falls back to its plain icons and
labels.

## Setting

Settings → Nerd Font glyphs → **Nerd Font icons**:

- **Automatic** (default): once per page, draws a few glyphs to a canvas and uses them only if they render.
- **Always** / **Never**: skip the check, for a font the check misses or to keep the plain look.

Without this plugin installed, the other plugins still run the check themselves, as Automatic.

## Which font

Glyphs use the theme's `--font-mono` first, so a Nerd Font set there (`"FiraCode Nerd Font"`) draws them. A theme with a
plain code font still finds an installed `Symbols Nerd Font` or a patched FiraCode, JetBrains Mono, Hack, Meslo,
Cascadia (CaskaydiaCove), or Iosevka.

## `bb-nerd-font`

`lib/` is the library the other plugins bundle, consumed like `bb-motion`: a `file:../nerd-font/lib` dependency plus a
`link:` pnpm override. diff-view's library imports it by relative path instead, since it is itself bundled by other
plugins.

- `useNerdFont()`: whether glyphs render. False until the check finishes, so the first paint shows the fallback. Call it
  once per list, not per row.
- `<Glyph glyph label? title? />`: one icon with the right font stack. Unlabelled glyphs are hidden from screen readers.
- `GLYPH`: the codepoints in use (octicons for git and GitHub, Material Design for the composer, seti and devicons for
  file types). `fileGlyph(path)` picks a file's icon. Glyphs are
  drawn in the surrounding text colour; kanban colours only a passing or failing check.

The answer lives on `<html>`: `data-nerd-font="on|off"` is the setting's forced choice and `data-nerd-font-detected`
the check's result, which every plugin bundle on the page shares. Set either in devtools to see the other look.
