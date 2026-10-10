import { useCallback } from "react";
import { toast } from "sonner";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { openToday } from "./daily";
import { PANEL_PATH, useOpenNote } from "./navigation";
import { getSearchStops, requestPanelTab, setKeysHelpOpen, setSearchStopIndex } from "./state";
import { requestSurfaceFocus } from "./vault-keys";
import { stepSearch, type VaultCommand } from "./vault-nav";

/** Keys that mean the same on every surface: search, panels, home, today, help. */
export function useGlobalCommands(): (command: VaultCommand) => boolean {
  const openNote = useOpenNote();
  const navigate = useBbNavigate();
  return useCallback(
    (command: VaultCommand) => {
      switch (command.kind) {
        case "search":
          requestPanelTab("files");
          requestSurfaceFocus("files", "search");
          return true;
        case "searchNext": {
          const { stops, index } = getSearchStops();
          const next = stepSearch(stops.length, index, command.step);
          if (next === null) {
            toast.message("No search matches. Press / to search the vault.");
            return true;
          }
          setSearchStopIndex(next);
          const stop = stops[next]!;
          openNote(stop.path, { target: stop.line === undefined ? undefined : { line: stop.line }, focus: false });
          return true;
        }
        case "panel":
          requestPanelTab(command.tab);
          requestSurfaceFocus(command.tab);
          return true;
        case "home":
          navigate.toPluginPanel(PANEL_PATH, { subPath: "" });
          requestSurfaceFocus("page");
          return true;
        case "today":
          void openToday().then(() => requestSurfaceFocus("page"));
          return true;
        case "help":
          setKeysHelpOpen(true);
          return true;
        default:
          return false;
      }
    },
    [openNote, navigate],
  );
}

export function copyToClipboard(text: string, what: string): void {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`Copied ${what}`, { description: text }),
    (cause: unknown) => toast.error(`Couldn't copy: ${cause instanceof Error ? cause.message : String(cause)}`),
  );
}
