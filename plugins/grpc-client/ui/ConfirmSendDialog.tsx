import { useRef } from "react";
import { stepIndex, useKeyHandler } from "bb-vim-keys/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CONFIRM_KEYMAP } from "./client-nav";

const CHOICE = "[data-confirm-choice]";

/** Asks before a call to a protected endpoint. h/l (or j/k, or the arrows) move between the buttons; focus starts on Cancel. */
export function ConfirmSendDialog({
  open,
  onOpenChange,
  endpoint,
  target,
  methodName,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint: string;
  target: string;
  methodName: string | null;
  onSend: () => void;
}) {
  const content = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const onKeyDown = useKeyHandler({
    keymap: CONFIRM_KEYMAP,
    onCommand: (motion) => {
      const choices = [...(content.current?.querySelectorAll<HTMLButtonElement>(CHOICE) ?? [])];
      const index = choices.findIndex((choice) => choice === document.activeElement);
      const next = choices[stepIndex(choices.length, index === -1 ? null : index, motion) ?? -1];
      if (next === undefined) return false;
      next.focus();
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={content}
        onKeyDown={onKeyDown}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Send to {endpoint}?</DialogTitle>
          <DialogDescription>
            {endpoint} (<span className="font-mono text-xs">{target}</span>) is protected. This really calls{" "}
            <span className="font-medium text-foreground">{methodName ?? "the method"}</span>.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={cancel} variant="ghost" data-confirm-choice="" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" data-confirm-choice="" onClick={onSend}>
            Send to {endpoint}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
