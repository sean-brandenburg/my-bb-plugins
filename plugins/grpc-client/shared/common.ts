// Imported by the page as well as the server and host, so it must not pull zod
// or the plugin SDK into the page bundle: type imports only.
import type { MethodKind } from "./schema.ts";

/** Stands in for credential values in call results and history. */
export const MASKED_VALUE = "***";

/** Realtime channel the page refetches on. */
export const CHANGED_CHANNEL = "changed";
export type ChangeReason = "config" | "history";

/** Client- and bidi-streaming requests are a JSON array of messages rather than one object. */
export function isClientStreaming(kind: MethodKind): boolean {
  return kind === "client_streaming" || kind === "bidi_streaming";
}

/** One response message as text: parsed JSON pretty-printed, raw text as is. */
export function formatResponse(response: unknown): string {
  return typeof response === "string" ? response : JSON.stringify(response, null, 2);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
