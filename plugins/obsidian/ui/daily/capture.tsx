import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { NUDGE, enter, exit, usePresence, useReplay } from "bb-motion";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { RoutineMode, rpcContract } from "../../rpc-contract";
import { errorMessage } from "../../shared/errors";
import { PANEL_PATH } from "../navigation";
import type { VaultRpc } from "../vault-client";

type Navigate = ReturnType<typeof useBbNavigate>;

/** The capture box grows with its text up to this height, then scrolls. */
const MAX_INPUT_HEIGHT_PX = 240;

/** How long the inline checkmark stays after an entry is logged. */
const LOGGED_CONFIRMATION_MS = 1400;

/**
 * Registration callbacks (commands, message actions) run outside React, so the
 * always-mounted overlay hands them the RPC client and navigation it owns.
 */
let appRpc: VaultRpc | null = null;
let appNavigate: Navigate | null = null;

interface CaptureDialogState {
  open: boolean;
  text: string;
  threadId?: string;
}

let dialogState: CaptureDialogState = { open: false, text: "" };
const dialogListeners = new Set<() => void>();
function setDialogState(next: CaptureDialogState) {
  dialogState = next;
  dialogListeners.forEach((listener) => listener());
}

export function openCaptureDialog(options: { text?: string; threadId?: string } = {}): void {
  setDialogState({ open: true, text: options.text ?? "", threadId: options.threadId });
}

function requireRpc(): VaultRpc {
  if (appRpc === null) throw new Error("The Vault plugin is still loading.");
  return appRpc;
}

/** Logs to today's inbox and toasts the outcome; true when it was saved. */
async function logCapture(text: string, threadId?: string): Promise<boolean> {
  try {
    const { path } = await requireRpc().call("capture", { text, threadId });
    toast.success("Logged to today's note", {
      description: path,
      action: { label: "Open", onClick: () => appNavigate?.toPluginPanel(PANEL_PATH, { subPath: path }) },
    });
    return true;
  } catch (cause) {
    toast.error(`Couldn't log it: ${errorMessage(cause)}`);
    return false;
  }
}

export async function captureText(text: string, threadId?: string): Promise<void> {
  await logCapture(text, threadId);
}

export async function openToday(): Promise<void> {
  try {
    const { path } = await requireRpc().call("openToday");
    appNavigate?.toPluginPanel(PANEL_PATH, { subPath: path });
  } catch (cause) {
    toast.error(errorMessage(cause));
  }
}

export async function startRoutine(mode: RoutineMode): Promise<void> {
  try {
    const { threadId } = await requireRpc().call("startRoutine", { mode });
    appNavigate?.toThread(threadId);
  } catch (cause) {
    toast.error(`Couldn't start the ${mode} routine: ${errorMessage(cause)}`);
  }
}

/** A textarea that logs to today's inbox: Enter sends, Shift+Enter adds a line. */
export function CaptureInput({
  autoFocus,
  initialText = "",
  threadId,
  onDone,
  className,
}: {
  autoFocus?: boolean;
  initialText?: string;
  threadId?: string;
  onDone?: () => void;
  className?: string;
}) {
  const [text, setText] = useState(initialText);
  const [pending, setPending] = useState(false);
  const [loggedCount, setLoggedCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const confirmation = usePresence(confirming);
  const nudge = useReplay(NUDGE);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), LOGGED_CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [confirming, loggedCount]);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    element.style.height = "auto";
    // scrollHeight excludes the border, which border-box sizing counts in height.
    const border = element.offsetHeight - element.clientHeight;
    element.style.height = `${Math.min(element.scrollHeight + border, MAX_INPUT_HEIGHT_PX)}px`;
    element.style.overflowY = element.scrollHeight + border > MAX_INPUT_HEIGHT_PX ? "auto" : "hidden";
  }, [text]);

  const submit = async () => {
    if (pending) return;
    if (text.trim() === "") {
      nudge.play();
      return;
    }
    setPending(true);
    const logged = await logCapture(text, threadId);
    setPending(false);
    if (!logged) {
      nudge.play();
      return;
    }
    setText("");
    setLoggedCount((count) => count + 1);
    setConfirming(true);
    onDone?.();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
    if (event.key === "Escape") {
      setText("");
      // Back onto the box's row for the vault's j/k cursor, where there is one.
      const row = ref.current?.closest<HTMLElement>("[data-nav-row]");
      if (row) row.focus({ preventScroll: true });
      else ref.current?.blur();
    }
  };

  return (
    // A stop for the vault's j/k cursor; Enter or i on it starts typing.
    <div className={cn("ob-capture", className)} data-nav-row="field" tabIndex={-1}>
      <textarea
        ref={ref}
        rows={1}
        value={text}
        autoFocus={autoFocus}
        disabled={pending}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        onAnimationEnd={nudge.onAnimationEnd}
        placeholder="Log to today… (Enter to save)"
        aria-label="Log to today's daily note"
        className={cn("ob-capture-input", nudge.className)}
      />
      {confirmation.mounted ? (
        <span aria-hidden className="ob-capture-check">
          <span key={loggedCount} className={confirmation.exiting ? exit.fade : enter.pop} onAnimationEnd={confirmation.onAnimationEnd}>
            <Icon name="CircleCheck" fallback="Check" className="size-4" />
          </span>
        </span>
      ) : null}
    </div>
  );
}

/** Mounted once per window: owns the capture dialog and the handles above. */
export function CaptureOverlay() {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const state = useSyncExternalStore(
    (listener) => {
      dialogListeners.add(listener);
      return () => void dialogListeners.delete(listener);
    },
    () => dialogState,
  );

  useEffect(() => {
    appRpc = rpc;
    appNavigate = navigate;
    return () => {
      if (appRpc === rpc) appRpc = null;
      if (appNavigate === navigate) appNavigate = null;
    };
  }, [rpc, navigate]);

  const close = () => setDialogState({ open: false, text: "" });

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log to today</DialogTitle>
          <DialogDescription>Goes into the Inbox of today's daily note. The wrap-up files it in the right place.</DialogDescription>
        </DialogHeader>
        <CaptureInput key={String(state.open)} autoFocus initialText={state.text} threadId={state.threadId} onDone={close} className="ob-capture-dialog-input" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
