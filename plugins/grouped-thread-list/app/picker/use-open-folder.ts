import { useState } from "react";
import { useRpc, useSdk } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { threadListRpcContract } from "../../server.js";
import { defaultHostId } from "../../shared/hosts.js";
import { getMutationErrorMessage } from "../ui/mutation-errors.js";

/**
 * Opens a folder as a project, creating one unless a project already has it.
 * `busy` is true while the server works on it.
 */
export function useOpenFolder(onOpened: (projectId: string) => void) {
  const sdk = useSdk();
  const rpc = useRpc<typeof threadListRpcContract>();
  const [busy, setBusy] = useState(false);

  const openFolder = async (path: string, hostId?: string) => {
    setBusy(true);
    try {
      const result = await rpc.call("openProjectFolder", {
        path,
        ...(hostId ? { hostId } : {}),
      });
      if (result.created) toast.success("Project added");
      onOpened(result.projectId);
    } catch (error) {
      toast.error(
        getMutationErrorMessage({
          error,
          fallbackMessage: "Failed to open the folder as a project.",
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  /** The system folder dialog, on the machine new projects default to. */
  const browseForFolder = async () => {
    let hostId: string;
    try {
      hostId = defaultHostId(await sdk.hosts.list());
    } catch (error) {
      toast.error(
        getMutationErrorMessage({
          error,
          fallbackMessage: "Failed to find a machine to browse.",
        }),
      );
      return;
    }
    const picked = await sdk.hosts
      .pickFolder({ hostId, clientHostId: hostId })
      .catch((error: unknown) => {
        toast.error(
          getMutationErrorMessage({
            error,
            fallbackMessage: "Failed to open the folder picker.",
          }),
        );
        return null;
      });
    if (picked?.path) await openFolder(picked.path, hostId);
  };

  return { busy, openFolder, browseForFolder };
}
