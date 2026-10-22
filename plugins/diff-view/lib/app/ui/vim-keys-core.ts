// The library's root entry, which imports nothing: for modules the node tests load, where React isn't installed.
// A relative path for the same reason as vim-keys.ts.
export {
  type KeyHelpSection,
  type Keymap,
  type ListMotion,
  mapKeymap,
  ROW_KEYS,
  compileSearch,
  matchOffsets,
} from "../../../../vim-mode/lib/index.ts";
