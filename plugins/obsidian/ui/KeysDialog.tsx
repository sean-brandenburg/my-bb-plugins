import { KeyHelp, useFocusReturn } from "bb-vim-keys/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setKeysHelpOpen, useKeysHelpOpen } from "./state";
import { KEY_HELP } from "./vault-nav";

export function KeysDialog() {
  const open = useKeysHelpOpen();
  const returnFocus = useFocusReturn(open);
  return (
    <Dialog open={open} onOpenChange={setKeysHelpOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl" onAfterCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Work anywhere on the Vault page (notes, the home, the calendar), its file sidebar, and its Outline and Backlinks tabs, outside a text box. The arrow keys work as h, j, k, and l.</DialogDescription>
        </DialogHeader>
        <KeyHelp sections={KEY_HELP} search />
      </DialogContent>
    </Dialog>
  );
}
