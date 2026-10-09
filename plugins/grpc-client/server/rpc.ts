import type { PluginRpcHandlers } from "@get-bb/plugin-sdk";
import { resolveSourceName } from "../shared/config.ts";
import type { Config } from "./config.ts";
import type { GrpcService } from "./grpc.ts";
import type { History } from "./history.ts";
import type { Overview, rpcContract } from "./rpc-contract.ts";

function overview(config: Config): Overview {
  return {
    endpoints: config.endpoints.map((endpoint) => ({
      name: endpoint.name,
      target: endpoint.target,
      transport: endpoint.transport,
      description: endpoint.description ?? null,
      source: resolveSourceName(endpoint, undefined, config.defaultSource),
      protected: endpoint.protected,
    })),
    sources: config.sources.map((source) => ({ name: source.name, kind: source.kind })),
    profiles: Object.keys(config.auth.profiles),
    timeoutSeconds: config.timeoutSeconds,
    errors: config.errors,
  };
}

export function rpcHandlers(grpc: GrpcService, history: History): PluginRpcHandlers<typeof rpcContract> {
  return {
    overview: async () => overview(await grpc.config()),
    services: ({ endpoint, source, reload }) => grpc.services(endpoint, source, reload),
    types: ({ endpoint, source, typeName }) => grpc.types(endpoint, source, typeName),
    invoke: (input) => grpc.invoke("ui", input),
    command: async (input) => ({ command: await grpc.command(input) }),
    history: ({ limit }) => ({ entries: history.list(limit) }),
    historyResult: ({ id }) => ({ result: history.result(id) }),
    deleteHistory: ({ ids }) => ({ deleted: history.delete(ids) }),
    clearHistory: () => ({ cleared: history.clear() }),
    resetAuth: async () => ({ cleared: await grpc.resetAuth() }),
  };
}
