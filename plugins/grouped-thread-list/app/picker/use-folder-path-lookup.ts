import { useEffect, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { threadListRpcContract } from "../../server.js";

const PATH_LOOKUP_DEBOUNCE_MS = 150;

export type PathLookup =
  | { status: "idle" }
  | { status: "checking"; query: string }
  | {
      status: "done";
      query: string;
      path: string | null;
      isDirectory: boolean;
      projectId: string | null;
    };

/** Asks the server whether a typed path is a folder and already a project. */
export function useFolderPathLookup(
  query: string,
  enabled: boolean,
): PathLookup {
  const rpc = useRpc<typeof threadListRpcContract>();
  const [lookup, setLookup] = useState<PathLookup>({ status: "idle" });
  useEffect(() => {
    if (!enabled) {
      setLookup({ status: "idle" });
      return;
    }
    let cancelled = false;
    setLookup({ status: "checking", query });
    const timer = window.setTimeout(() => {
      void rpc
        .call("inspectFolder", { path: query })
        .then((result) => {
          if (!cancelled) setLookup({ status: "done", query, ...result });
        })
        .catch(() => {
          if (!cancelled) {
            setLookup({
              status: "done",
              query,
              path: null,
              isDirectory: false,
              projectId: null,
            });
          }
        });
    }, PATH_LOOKUP_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, query, rpc]);
  return lookup;
}

/** The folder Enter would open, once the lookup for this query has settled. */
export function openableFolderPath(lookup: PathLookup): string | null {
  return lookup.status === "done" && lookup.isDirectory && lookup.path
    ? lookup.path
    : null;
}

export function describePathLookup(lookup: PathLookup, query: string): string {
  if (lookup.status !== "done" || lookup.query !== query) return "Checking…";
  if (!lookup.isDirectory) return "Not a folder";
  if (lookup.projectId !== null) {
    return "Already a project: Enter switches to it";
  }
  return "Enter adds it as a project";
}
