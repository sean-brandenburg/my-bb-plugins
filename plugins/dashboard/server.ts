import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract } from "./rpc-contract.js";
import { createUsageService } from "./server/usage.js";

export default async function plugin(bb: BbPluginApi) {
  const usage = createUsageService(bb);
  bb.rpc.register(rpcContract, {
    usage: ({ refresh }) => usage.usage(refresh),
  });
}
