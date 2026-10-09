import { GLYPH, glyph } from "./glyphs";

const TYPESCRIPT = 0xe628;
const JAVASCRIPT = 0xe60c;
const REACT = 0xe625;
const JSON_FILE = 0xe80b;
const SHELL = 0xe691;
const IMAGE = 0xe60d;
const ARCHIVE = 0xe6aa;
const CONFIG = 0xe615;
const C_FAMILY = 0xe649;
const CPP = 0xe646;

const BY_EXTENSION: Record<string, number> = {
  ts: TYPESCRIPT,
  mts: TYPESCRIPT,
  cts: TYPESCRIPT,
  tsx: REACT,
  jsx: REACT,
  js: JAVASCRIPT,
  mjs: JAVASCRIPT,
  cjs: JAVASCRIPT,
  py: 0xe606,
  pyi: 0xe606,
  ipynb: 0xe678,
  go: 0xe627,
  rs: 0xe68b,
  rb: 0xe605,
  java: 0xe66d,
  kt: 0xe634,
  kts: 0xe634,
  scala: 0xe68e,
  swift: 0xe699,
  c: C_FAMILY,
  h: C_FAMILY,
  cc: CPP,
  cpp: CPP,
  cxx: CPP,
  hpp: CPP,
  cs: 0xe648,
  php: 0xe608,
  lua: 0xe620,
  dart: 0xe64c,
  ex: 0xe62d,
  exs: 0xe62d,
  erl: 0xe7b1,
  hs: 0xe61f,
  elm: 0xe62c,
  ml: 0xe67a,
  clj: 0xe642,
  zig: 0xe6a9,
  nim: 0xe677,
  jl: 0xe624,
  r: 0xe68a,
  vue: 0xe6a0,
  svelte: 0xe697,
  astro: 0xe6b3,
  html: 0xe60e,
  htm: 0xe60e,
  css: 0xe614,
  scss: 0xe603,
  sass: 0xe603,
  less: 0xe60b,
  graphql: 0xe662,
  gql: 0xe662,
  proto: 0xe7f5,
  sql: 0xe706,
  prisma: 0xe684,
  md: 0xe609,
  mdx: 0xe609,
  txt: 0xe64e,
  json: JSON_FILE,
  jsonc: JSON_FILE,
  json5: JSON_FILE,
  yaml: 0xe6a8,
  yml: 0xe6a8,
  toml: 0xe6b2,
  xml: 0xe619,
  csv: 0xe64a,
  ini: CONFIG,
  conf: CONFIG,
  cfg: CONFIG,
  env: CONFIG,
  sh: SHELL,
  bash: SHELL,
  zsh: SHELL,
  fish: SHELL,
  ps1: 0xe683,
  tf: 0xe69a,
  tfvars: 0xe69a,
  nix: 0xe843,
  vim: 0xe62b,
  lock: 0xe672,
  svg: 0xe698,
  png: IMAGE,
  jpg: IMAGE,
  jpeg: IMAGE,
  gif: IMAGE,
  webp: IMAGE,
  ico: IMAGE,
  pdf: 0xe67d,
  zip: ARCHIVE,
  tar: ARCHIVE,
  gz: ARCHIVE,
  tgz: ARCHIVE,
  wasm: 0xe6a1,
};

const BY_NAME: Record<string, number> = {
  dockerfile: 0xe650,
  "docker-compose.yml": 0xe650,
  "docker-compose.yaml": 0xe650,
  makefile: 0xe673,
  "package.json": 0xe71e,
  "package-lock.json": 0xe71e,
  "pnpm-lock.yaml": 0xe865,
  "yarn.lock": 0xe6a7,
  "cargo.toml": 0xe68b,
  "cargo.lock": 0xe68b,
  "go.mod": 0xe627,
  "go.sum": 0xe627,
  ".gitignore": 0xe65d,
  ".gitattributes": 0xe65d,
  ".gitmodules": 0xe65d,
  ".editorconfig": 0xe652,
  ".env": CONFIG,
  license: 0xe60a,
  "license.md": 0xe60a,
  "license.txt": 0xe60a,
  jenkinsfile: 0xe66e,
};

const BY_PREFIX: ReadonlyArray<readonly [prefix: string, codepoint: number]> = [
  ["tsconfig", 0xe69d],
  ["vite.config.", 0xe8d7],
  ["vitest.config.", 0xe8d9],
  ["eslint.config.", 0xe655],
  [".eslintrc", 0xe655],
  [".prettierrc", 0xe6b4],
  [".env.", CONFIG],
  ["dockerfile.", 0xe650],
];

/** The icon for a file, from its well-known name, then its name's start, then its extension; a plain page otherwise. */
export function fileGlyph(path: string): string {
  const name = (path.split("/").pop() ?? path).toLowerCase();
  const dot = name.lastIndexOf(".");
  const entry =
    BY_NAME[name] ??
    BY_PREFIX.find(([prefix]) => name.startsWith(prefix))?.[1] ??
    (dot === -1 ? undefined : BY_EXTENSION[name.slice(dot + 1)]);
  return entry === undefined ? GLYPH.file : glyph(entry);
}
