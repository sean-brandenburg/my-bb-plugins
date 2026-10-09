// A relative path rather than the `bb-nerd-font` package: this library is bundled by other plugins, so a bare import
// here would resolve from the wrong node_modules.
export { GLYPH, Glyph, fileGlyph, useNerdFont } from "../../../../nerd-font/lib";
