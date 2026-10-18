#!/usr/bin/env node
// Typechecks and tests every plugin that builds on a shared library, since a library change
// reaches all of them through a live link and each plugin's own checks only cover itself.
//
//   node scripts/check-lib-consumers.mjs vim-mode/lib        # bb-vim-keys
//   node scripts/check-lib-consumers.mjs motion/lib diff-view/lib
//
// A consumer is a plugin whose package.json links the library, or whose source imports it by
// relative path (diff-view's library does, because other plugins bundle it). The plugin that
// holds the library counts too.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginsDir = join(repo, "plugins");
const libraries = process.argv.slice(2).map((arg) => arg.replace(/^plugins\//, "").replace(/\/$/, ""));
if (libraries.length === 0) {
  console.error("usage: check-lib-consumers.mjs <plugin>/lib [...]");
  process.exit(2);
}

const SOURCE = /\.(ts|tsx|mts)$/;
const SKIP = new Set(["node_modules", "dist", ".bb", ".git"]);

function* sources(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (SOURCE.test(entry)) yield path;
  }
}

function consumes(plugin, library) {
  if (library.split("/")[0] === plugin) return true;
  const manifest = readFileSync(join(pluginsDir, plugin, "package.json"), "utf8");
  if (manifest.includes(`../${library}"`)) return true;
  const target = join(pluginsDir, library) + sep;
  for (const file of sources(join(pluginsDir, plugin))) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
      if (join(dirname(file), specifier).startsWith(target)) return true;
    }
  }
  return false;
}

const plugins = readdirSync(pluginsDir).filter((name) => existsSync(join(pluginsDir, name, "package.json")));
const consumers = plugins.filter((plugin) => libraries.some((library) => consumes(plugin, library)));

function run(plugin, script) {
  const scripts = JSON.parse(readFileSync(join(pluginsDir, plugin, "package.json"), "utf8")).scripts ?? {};
  if (scripts[script] === undefined) return { status: "none" };
  const result = spawnSync("pnpm", ["run", "--silent", script], { cwd: join(pluginsDir, plugin), encoding: "utf8" });
  return { status: result.status === 0 ? "ok" : "failed", output: `${result.stdout}${result.stderr}` };
}

let failed = false;
for (const plugin of consumers) {
  for (const script of ["typecheck", "test"]) {
    const result = run(plugin, script);
    console.log(`${result.status.padEnd(6)} ${plugin} ${script}`);
    if (result.status === "failed") {
      failed = true;
      console.log(result.output.trim().split("\n").slice(-40).join("\n"));
    }
  }
}
console.log(`\n${consumers.length} plugins build on ${libraries.join(", ")}: ${consumers.map((plugin) => relative(pluginsDir, join(pluginsDir, plugin))).join(", ")}`);
process.exit(failed ? 1 : 0);
