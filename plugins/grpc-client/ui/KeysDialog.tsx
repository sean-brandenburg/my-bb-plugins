import { KeyHelp, useFocusReturn } from "bb-vim-keys/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KEY_HELP } from "./client-nav";

export function KeysDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const returnFocus = useFocusReturn(open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onAfterCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Work anywhere in the gRPC view outside a text box. The arrow keys work as h, j, k and l.</DialogDescription>
        </DialogHeader>
        <KeyHelp sections={KEY_HELP} search />
      </DialogContent>
    </Dialog>
  );
}
