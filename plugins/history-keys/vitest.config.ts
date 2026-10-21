import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    silent: "passed-only",
    name: "bb-plugin-history-keys",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**"],
    // Node's built-in Web Storage global shadows jsdom's window.localStorage.
    execArgv: ["--no-experimental-webstorage"],
  },
});
