// Runs on the bb server's machine: builds and caches descriptor sets, runs
// auth commands, and invokes grpcurl.
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { hostContract } from "./contract.ts";
import { listServices, typeClosure } from "./shared/descriptors.ts";
import type { DescriptorState } from "./shared/schema.ts";
import { tokenCache } from "./host/auth.ts";
import { loadDescriptors, setDataDir } from "./host/descriptor-cache.ts";
import { command, invoke } from "./host/invoke.ts";

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    async services(input, context) {
      setDataDir(context.experimental_paths.dataDir);
      const loaded = await loadDescriptors(input, input.reload);
      const state: DescriptorState = {
        key: loaded.key,
        loadedAt: loaded.loadedAt,
        fileCount: loaded.fileCount,
        fromCache: loaded.fromCache,
        warnings: [],
      };
      return { state, services: listServices(loaded.registry, input.auth.rules, input.endpoint) };
    },

    async types(input, context) {
      setDataDir(context.experimental_paths.dataDir);
      const loaded = await loadDescriptors(input, false);
      return typeClosure(loaded.registry, input.typeName);
    },

    async invoke(input, context) {
      setDataDir(context.experimental_paths.dataDir);
      return invoke(input, context.signal);
    },

    async command(input, context) {
      setDataDir(context.experimental_paths.dataDir);
      return { command: await command(input) };
    },

    resetAuth() {
      return { cleared: tokenCache.reset() };
    },
  },
});
