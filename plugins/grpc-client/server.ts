import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { CHANGED_CHANNEL, type ChangeReason } from "./shared/common.ts";
import { grpcCli } from "./server/cli.ts";
import { SETTINGS } from "./server/config.ts";
import { createGrpcService } from "./server/grpc.ts";
import { createHistory } from "./server/history.ts";
import { rpcHandlers } from "./server/rpc.ts";
import { rpcContract } from "./server/rpc-contract.ts";
import { createSettingEditor } from "./server/setting-edits.ts";

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define(SETTINGS);
  const publishChange = (reason: ChangeReason) => bb.realtime.publish(CHANGED_CHANNEL, { reason });
  settings.onChange(() => publishChange("config"));

  const history = createHistory(bb.storage, () => publishChange("history"));
  const grpc = createGrpcService(bb, settings, history);

  bb.rpc.register(rpcContract, rpcHandlers(grpc, history));
  bb.cli.register(grpcCli({ grpc, history, editSetting: createSettingEditor(settings, bb.pluginId) }));
}
