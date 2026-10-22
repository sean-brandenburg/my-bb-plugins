// bb-plugin-activity — backend entry.
//
// The app's content script watches clicks, keys, and routes across bb and
// every plugin and posts them here in batches; this side keeps them in the
// plugin's sqlite file and answers the Activity page and `bb activity`.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract } from "./contract";
import { registerCli } from "./server/cli";
import { createStore } from "./server/store";

export { rpcContract } from "./contract";

export default async function plugin(bb: BbPluginApi) {
  const store = createStore(bb);
  bb.rpc.register(rpcContract, {
    record: async ({ events }) => {
      store.record(events);
      return null;
    },
    summary: async (query) => store.summary(query),
    recent: async ({ limit }) => store.recent(limit),
  });
  registerCli(bb, store);
}
