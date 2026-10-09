import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract } from "./rpc-contract.ts";
import { registerCli } from "./server/cli.ts";
import { DAILY_SETTINGS, createDaily } from "./server/daily.ts";
import { VAULT_SETTINGS, createVault } from "./server/vault.ts";

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({ ...VAULT_SETTINGS, ...DAILY_SETTINGS });
  const vault = createVault(bb, settings);
  const daily = createDaily(bb, vault.access, settings);

  bb.rpc.register(rpcContract, {
    async status() {
      return { ...(await vault.status()), ...(await daily.status()) };
    },
    ...vault.rpcHandlers,
    ...daily.rpcHandlers,
  });

  registerCli(bb, { vault, daily });
}
