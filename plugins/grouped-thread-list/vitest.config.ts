import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // bb-motion links to ../motion/lib, which has no node_modules of its own;
    // its React import has to resolve from this plugin's.
    dedupe: ["react"],
  },
  test: {
    silent: "passed-only",
    name: "bb-plugin-grouped-thread-list",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**"],
    // Node's built-in Web Storage global shadows jsdom's window.localStorage.
    execArgv: ["--no-experimental-webstorage"],
  },
});
