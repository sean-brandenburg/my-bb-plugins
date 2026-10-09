// The app's view of the vault: RPC client, status, file tree, link resolver,
// live change signals, and the preview URL vault images are served from.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { PluginRpcResult } from "@get-bb/plugin-sdk";
import { VAULT_CHANGED, type VaultChangedPayload, type VaultTree } from "../contract";
import type { rpcContract } from "../rpc-contract";
import { errorMessage } from "../shared/errors";
import { createResolver, isNotePath, type LinkResolver } from "../shared/obsidian";

export type VaultRpc = ReturnType<typeof useRpc<typeof rpcContract>>;

export type VaultStatus = PluginRpcResult<(typeof rpcContract)["status"]>;

/** Preview URLs this close to expiry are refreshed rather than reused. */
const PREVIEW_EXPIRY_MARGIN_MS = 60_000;

/** Subscribes to vault change signals and re-syncs after a realtime reconnect. */
export function useVaultChanges(handler: (payload: VaultChangedPayload) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useRealtime(VAULT_CHANGED, (payload) => handlerRef.current(payload as VaultChangedPayload));
  const connection = useRealtimeConnectionState();
  const wasConnected = useRef(false);
  useEffect(() => {
    if (connection !== "connected") return;
    if (wasConnected.current) handlerRef.current({ paths: [], structural: true });
    wasConnected.current = true;
  }, [connection]);
}

export function useVault() {
  const rpc = useRpc<typeof rpcContract>();
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [tree, setTree] = useState<VaultTree | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshTree = useCallback(async () => {
    try {
      const nextStatus = await rpc.call("status");
      setStatus(nextStatus);
      if (nextStatus.vaultPath === null) {
        setTree(null);
        return;
      }
      setTree(await rpc.call("tree"));
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [rpc]);

  useEffect(() => {
    void refreshTree();
  }, [refreshTree]);

  useVaultChanges((payload) => {
    if (payload.structural) void refreshTree();
  });

  const resolver = useMemo<LinkResolver>(
    () => createResolver(tree?.files.map((file) => file.path) ?? []),
    [tree],
  );
  const notePaths = useMemo(
    () => tree?.files.map((file) => file.path).filter(isNotePath) ?? [],
    [tree],
  );

  return { rpc, status, tree, resolver, notePaths, error, refreshTree };
}

export type Vault = ReturnType<typeof useVault>;

let previewCache: { baseUrl: string; expiresAtMs: number } | null = null;
let previewPending: Promise<string> | null = null;

/** Base URL for serving vault files (images) to the browser; refreshed before expiry. */
export function usePreviewBase(rpc: VaultRpc): string | null {
  const [baseUrl, setBaseUrl] = useState<string | null>(
    previewCache !== null && previewCache.expiresAtMs - Date.now() > PREVIEW_EXPIRY_MARGIN_MS ? previewCache.baseUrl : null,
  );
  useEffect(() => {
    if (baseUrl !== null) return;
    let cancelled = false;
    previewPending ??= rpc.call("previewBase").then(
      (result) => {
        previewCache = result;
        previewPending = null;
        return result.baseUrl;
      },
      (error) => {
        previewPending = null;
        throw error;
      },
    );
    previewPending.then(
      (url) => {
        if (!cancelled) setBaseUrl(url);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [rpc, baseUrl]);
  return baseUrl;
}

export function previewUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/?$/, "/") + path.split("/").map(encodeURIComponent).join("/");
}
