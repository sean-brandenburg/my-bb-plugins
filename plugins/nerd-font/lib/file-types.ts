import { GLYPH, glyph } from "./glyphs";

export interface FileGlyph {
  glyph: string;
  /** A mid-tone brand colour that reads on light and dark backgrounds; null keeps the surrounding text colour. */
  color: string | null;
}

type Entry = readonly [codepoint: number, color: string | null];

const TYPESCRIPT: Entry = [0xe628, "#3178c6"];
const JAVASCRIPT: Entry = [0xe60c, "#d4a72c"];
const REACT: Entry = [0xe625, "#1ea7c9"];
const JSON_FILE: Entry = [0xe80b, "#c9a227"];
const SHELL: Entry = [0xe691, "#4eaa25"];
const IMAGE: Entry = [0xe60d, "#a074c4"];
const ARCHIVE: Entry = [0xe6aa, "#d4932c"];
const CONFIG: Entry = [0xe615, "#7c8a96"];
const C_FAMILY: Entry = [0xe649, "#5c6bc0"];
const CPP: Entry = [0xe646, "#00599c"];

const BY_EXTENSION: Record<string, Entry> = {
  ts: TYPESCRIPT,
  mts: TYPESCRIPT,
  cts: TYPESCRIPT,
  tsx: REACT,
  jsx: REACT,
  js: JAVASCRIPT,
  mjs: JAVASCRIPT,
  cjs: JAVASCRIPT,
  py: [0xe606, "#3776ab"],
  pyi: [0xe606, "#3776ab"],
  ipynb: [0xe678, "#e57c1f"],
  go: [0xe627, "#00add8"],
  rs: [0xe68b, "#ce6a3b"],
  rb: [0xe605, "#cc342d"],
  java: [0xe66d, "#e76f00"],
  kt: [0xe634, "#7f52ff"],
  kts: [0xe634, "#7f52ff"],
  scala: [0xe68e, "#dc322f"],
  swift: [0xe699, "#f05138"],
  c: C_FAMILY,
  h: C_FAMILY,
  cc: CPP,
  cpp: CPP,
  cxx: CPP,
  hpp: CPP,
  cs: [0xe648, "#8a5cc2"],
  php: [0xe608, "#777bb4"],
  lua: [0xe620, "#4f6fd8"],
  dart: [0xe64c, "#00b4ab"],
  ex: [0xe62d, "#a074c4"],
  exs: [0xe62d, "#a074c4"],
  erl: [0xe7b1, "#b83998"],
  hs: [0xe61f, "#8f4fc4"],
  elm: [0xe62c, "#60b5cc"],
  ml: [0xe67a, "#e37933"],
  clj: [0xe642, "#63b132"],
  zig: [0xe6a9, "#e8a21b"],
  nim: [0xe677, "#d6b62e"],
  jl: [0xe624, "#a270ba"],
  r: [0xe68a, "#2369bc"],
  vue: [0xe6a0, "#41b883"],
  svelte: [0xe697, "#ff3e00"],
  astro: [0xe6b3, "#ff5d01"],
  html: [0xe60e, "#e34c26"],
  htm: [0xe60e, "#e34c26"],
  css: [0xe614, "#42a5f5"],
  scss: [0xe603, "#cd6799"],
  sass: [0xe603, "#cd6799"],
  less: [0xe60b, "#5f8fcf"],
  graphql: [0xe662, "#e535ab"],
  gql: [0xe662, "#e535ab"],
  proto: [0xe7f5, "#4c9fd4"],
  sql: [0xe706, "#e38c00"],
  prisma: [0xe684, "#5a67d8"],
  md: [0xe609, "#519aba"],
  mdx: [0xe609, "#519aba"],
  txt: [0xe64e, null],
  json: JSON_FILE,
  jsonc: JSON_FILE,
  json5: JSON_FILE,
  yaml: [0xe6a8, "#cb4b4b"],
  yml: [0xe6a8, "#cb4b4b"],
  toml: [0xe6b2, "#9c6b4e"],
  xml: [0xe619, "#e37933"],
  csv: [0xe64a, "#6bab3b"],
  ini: CONFIG,
  conf: CONFIG,
  cfg: CONFIG,
  env: CONFIG,
  sh: SHELL,
  bash: SHELL,
  zsh: SHELL,
  fish: SHELL,
  ps1: [0xe683, "#3b82c4"],
  tf: [0xe69a, "#7b42bc"],
  tfvars: [0xe69a, "#7b42bc"],
  nix: [0xe843, "#6f9fd8"],
  vim: [0xe62b, "#3d9b48"],
  lock: [0xe672, null],
  svg: [0xe698, "#e8a33a"],
  png: IMAGE,
  jpg: IMAGE,
  jpeg: IMAGE,
  gif: IMAGE,
  webp: IMAGE,
  ico: IMAGE,
  pdf: [0xe67d, "#d0352b"],
  zip: ARCHIVE,
  tar: ARCHIVE,
  gz: ARCHIVE,
  tgz: ARCHIVE,
  wasm: [0xe6a1, "#654ff0"],
};

const BY_NAME: Record<string, Entry> = {
  dockerfile: [0xe650, "#2496ed"],
  "docker-compose.yml": [0xe650, "#2496ed"],
  "docker-compose.yaml": [0xe650, "#2496ed"],
  makefile: [0xe673, "#7c8a96"],
  "package.json": [0xe71e, "#cb3837"],
  "package-lock.json": [0xe71e, "#cb3837"],
  "pnpm-lock.yaml": [0xe865, "#e8a21b"],
  "yarn.lock": [0xe6a7, "#2c8ebb"],
  "cargo.toml": [0xe68b, "#ce6a3b"],
  "cargo.lock": [0xe68b, "#ce6a3b"],
  "go.mod": [0xe627, "#00add8"],
  "go.sum": [0xe627, "#00add8"],
  ".gitignore": [0xe65d, "#f05033"],
  ".gitattributes": [0xe65d, "#f05033"],
  ".gitmodules": [0xe65d, "#f05033"],
  ".editorconfig": [0xe652, null],
  ".env": CONFIG,
  license: [0xe60a, "#c9a227"],
  "license.md": [0xe60a, "#c9a227"],
  "license.txt": [0xe60a, "#c9a227"],
  jenkinsfile: [0xe66e, "#d24939"],
};

const BY_PREFIX: ReadonlyArray<readonly [prefix: string, entry: Entry]> = [
  ["tsconfig", [0xe69d, "#3178c6"]],
  ["vite.config.", [0xe8d7, "#8a6cf0"]],
  ["vitest.config.", [0xe8d9, "#6e9f18"]],
  ["eslint.config.", [0xe655, "#6a62d6"]],
  [".eslintrc", [0xe655, "#6a62d6"]],
  [".prettierrc", [0xe6b4, "#56b3b4"]],
  [".env.", CONFIG],
  ["dockerfile.", [0xe650, "#2496ed"]],
];

/** The icon for a file, from its well-known name, then its name's start, then its extension; a plain page otherwise. */
export function fileGlyph(path: string): FileGlyph {
  const name = (path.split("/").pop() ?? path).toLowerCase();
  const dot = name.lastIndexOf(".");
  const entry =
    BY_NAME[name] ??
    BY_PREFIX.find(([prefix]) => name.startsWith(prefix))?.[1] ??
    (dot === -1 ? undefined : BY_EXTENSION[name.slice(dot + 1)]);
  return entry === undefined ? { glyph: GLYPH.file, color: null } : { glyph: glyph(entry[0]), color: entry[1] };
}
