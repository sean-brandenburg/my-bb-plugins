import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // bb-motion and bb-nerd-font link to sibling plugins' libs; their React import has to resolve
    // from this plugin's, or hooks run against a second copy.
    dedupe: ["react", "react-dom"],
  },
  test: {
    silent: "passed-only",
    name: "bb-plugin-dashboard",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**"],
    execArgv: ["--no-experimental-webstorage"],
  },
});
