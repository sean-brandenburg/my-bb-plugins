import { KeyHelp, useFocusReturn } from "bb-vim-keys/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KEY_HELP } from "./board-nav";

export function BoardKeysDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const returnFocus = useFocusReturn(open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl" onAfterCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Work anywhere on the board or an open card outside a text box.</DialogDescription>
        </DialogHeader>
        <KeyHelp sections={KEY_HELP} search />
      </DialogContent>
    </Dialog>
  );
}
