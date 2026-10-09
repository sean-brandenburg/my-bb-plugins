import type { BbPluginApi, PluginSettingsHandle } from "@get-bb/plugin-sdk";
import { AUTH_COMMAND_TIMEOUT_MS, DESCRIPTOR_BUILD_TIMEOUT_MS, hostContract, type CallResult, type Launch } from "../contract.ts";
import { errorMessage } from "../shared/common.ts";
import type { TypeClosure } from "../shared/schema.ts";
import { loadConfig, resolveLaunch, type Config, type SETTINGS } from "./config.ts";
import type { CallOrigin, History } from "./history.ts";
import type { CallRequest } from "./rpc-contract.ts";

// Worst cases on the host: a descriptor build, and a token command + refresh + command, each of
// which may wait on an interactive SSO login.
const AUTH_TIMEOUT_MS = 3 * AUTH_COMMAND_TIMEOUT_MS + 30_000;
const DESCRIPTOR_TIMEOUT_MS = DESCRIPTOR_BUILD_TIMEOUT_MS + AUTH_TIMEOUT_MS;

/** The operations the page RPC and the CLI share; each reads the settings afresh and runs on the host. */
export function createGrpcService(bb: BbPluginApi, settings: PluginSettingsHandle<typeof SETTINGS>, history: History) {
  const host = bb.hosts.experimental_client({ contract: hostContract });

  async function hostId(): Promise<string> {
    const { primaryHostId } = await bb.sdk.system.config();
    if (primaryHostId === null) throw new Error("The bb server machine is not connected yet.");
    return primaryHostId;
  }

  async function config(): Promise<Config> {
    return loadConfig(await settings.get());
  }

  function hostCall(config: Config, launch: Launch, request: CallRequest) {
    const timeoutSeconds = request.timeoutSeconds ?? config.timeoutSeconds;
    return { ...launch, method: request.method, request: request.request, metadata: request.metadata, timeoutSeconds };
  }

  return {
    config,

    async services(endpoint: string, source: string | undefined, reload: boolean) {
      const launch = resolveLaunch(await config(), endpoint, source);
      const result = await host.call("services", { ...launch, reload }, { hostId: await hostId(), timeoutMs: DESCRIPTOR_TIMEOUT_MS });
      return { source: launch.source.name, ...result };
    },

    async types(endpoint: string, source: string | undefined, typeName: string): Promise<TypeClosure> {
      const launch = resolveLaunch(await config(), endpoint, source);
      return host.call("types", { ...launch, typeName }, { hostId: await hostId(), timeoutMs: DESCRIPTOR_TIMEOUT_MS });
    },

    async invoke(origin: CallOrigin, request: CallRequest): Promise<CallResult> {
      const current = await config();
      const launch = resolveLaunch(current, request.endpoint, request.source);
      const input = hostCall(current, launch, request);
      const result = await host.call("invoke", input, {
        hostId: await hostId(),
        timeoutMs: input.timeoutSeconds * 1000 + DESCRIPTOR_TIMEOUT_MS + AUTH_TIMEOUT_MS,
      });
      try {
        history.record(origin, launch, request, result);
      } catch (error) {
        // The call already happened; losing its history row must not make it look failed.
        bb.log.warn(`Could not record call history: ${errorMessage(error)}`);
      }
      return result;
    },

    async command(request: CallRequest): Promise<string> {
      const current = await config();
      const launch = resolveLaunch(current, request.endpoint, request.source);
      const { command } = await host.call("command", hostCall(current, launch, request), { hostId: await hostId(), timeoutMs: DESCRIPTOR_TIMEOUT_MS });
      return command;
    },

    async resetAuth(): Promise<number> {
      return (await host.call("resetAuth", null, { hostId: await hostId() })).cleared;
    },
  };
}
export type GrpcService = ReturnType<typeof createGrpcService>;
