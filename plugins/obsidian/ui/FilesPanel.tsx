import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { CaptureInput } from "./daily";
import { VaultExplorer } from "./Explorer";
import { PANEL_PATH } from "./navigation";
import { useVaultActions } from "./vault-actions";
import { useVault } from "./vault-client";

/** The Vault page's "Files" tab in bb's right panel. */
export function FilesPanel() {
  const vault = useVault();
  const actions = useVaultActions(vault);
  const navigate = useBbNavigate();
  if (vault.status !== null && vault.status.vaultPath === null) {
    return (
      <div className="p-3 text-sm">
        <p className="text-muted-foreground">No vault is open yet.</p>
        <Button size="sm" className="mt-2" onClick={() => navigate.toPluginPanel(PANEL_PATH)}>
          Choose a vault
        </Button>
      </div>
    );
  }
  return <VaultExplorer vault={vault} actions={actions} accessory={<CaptureInput className="mt-1.5" />} />;
}
