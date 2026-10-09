import { useEffect, useState } from "react";
import { getSharedHighlighter } from "@pierre/diffs";
import type { ThemedToken } from "@pierre/diffs";

/** Files longer than this skip Shiki; tokenising both sides of a huge generated file stalls the page. */
const SHIKI_MAX_LINES = 5000;

const SHIKI_LANG_BY_EXTENSION: Record<string, string> = {
  go: "go", ts: "typescript", mts: "typescript", cts: "typescript", tsx: "tsx", js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
  py: "python", rs: "rust", java: "java", kt: "kotlin", kts: "kotlin", rb: "ruby", php: "php", cs: "csharp", swift: "swift", scala: "scala",
  c: "c", h: "c", cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", m: "objective-c",
  sh: "shellscript", bash: "shellscript", zsh: "shellscript", fish: "fish", ps1: "powershell",
  yaml: "yaml", yml: "yaml", json: "json", jsonc: "jsonc", toml: "toml", xml: "xml", ini: "ini", env: "dotenv",
  md: "markdown", mdx: "mdx", html: "html", htm: "html", css: "css", scss: "scss", less: "less", vue: "vue", svelte: "svelte",
  sql: "sql", proto: "proto", graphql: "graphql", gql: "graphql", tf: "terraform", hcl: "hcl", dockerfile: "docker", lua: "lua", r: "r", dart: "dart", ex: "elixir", exs: "elixir", erl: "erlang", hs: "haskell", zig: "zig", nix: "nix", cmake: "cmake", make: "makefile", mk: "makefile",
};

export function shikiLangFor(path: string): string | null {
  const base = path.split("/").pop() ?? path;
  const lower = base.toLowerCase();
  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) return "docker";
  if (lower === "makefile") return "makefile";
  const extension = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  return SHIKI_LANG_BY_EXTENSION[extension] ?? null;
}

export type LineTokens = Array<{ content: string; color: string | undefined }>;

/** Shiki tokens per line from the host's shared highlighter; null while loading or when the language is unknown. */
export function useShikiTokens(code: string, lang: string | null, theme: string): LineTokens[] | null {
  const [state, setState] = useState<{ key: string; tokens: LineTokens[] } | null>(null);
  const key = `${lang ?? ""}\u0000${theme}\u0000${code.length}\u0000${code.slice(0, 2000)}`;
  useEffect(() => {
    if (lang === null || code === "" || code.split("\n").length > SHIKI_MAX_LINES) return;
    let cancelled = false;
    getSharedHighlighter({ themes: [theme as never], langs: [lang as never] })
      .then((highlighter) => {
        if (cancelled) return;
        const lines = highlighter.codeToTokensBase(code, { lang: lang as never, theme: theme as never }) as ThemedToken[][];
        setState({ key, tokens: lines.map((line) => line.map((token) => ({ content: token.content, color: token.color }))) });
      })
      .catch(() => {
        // Unknown grammar or theme: fall back to unhighlighted text rather than failing the file.
      });
    return () => {
      cancelled = true;
    };
  }, [code, lang, theme, key]);
  return state !== null && state.key === key ? state.tokens : null;
}
