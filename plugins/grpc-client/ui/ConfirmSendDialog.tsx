import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STEPS: Record<string, number> = { h: -1, k: -1, ArrowLeft: -1, ArrowUp: -1, l: 1, j: 1, ArrowRight: 1, ArrowDown: 1 };
const CHOICE = "[data-confirm-choice]";

/** Asks before a call to a protected endpoint. h/l (or j/k) move between the buttons; focus starts on Cancel. */
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
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const step = STEPS[event.key];
    if (step === undefined || content.current === null) return;
    const choices = [...content.current.querySelectorAll<HTMLButtonElement>(CHOICE)];
    const index = choices.findIndex((choice) => choice === document.activeElement);
    const next = choices[index === -1 ? 0 : Math.min(Math.max(index + step, 0), choices.length - 1)];
    if (next === undefined) return;
    event.preventDefault();
    next.focus();
  };
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
            {endpoint} ({target}) is protected. This really calls {methodName ?? "the method"}.
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
