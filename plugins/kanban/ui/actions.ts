import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "./format";

export function toastError(cause: unknown): void {
  toast.error(errorMessage(cause));
}

export type RunAction = (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;

/** Board actions from a panel: `pending` while one runs, a toast for the outcome, then `onDone` to refresh. */
export function usePendingAction(onDone: () => void): { pending: boolean; run: RunAction } {
  const [pending, setPending] = useState(false);
  const run: RunAction = async (action, successMessage) => {
    setPending(true);
    try {
      await action();
      onDone();
      if (successMessage !== undefined) toast.success(successMessage);
    } catch (cause) {
      toastError(cause);
    } finally {
      setPending(false);
    }
  };
  return { pending, run };
}
