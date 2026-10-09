/** Logs to the devtools console under the plugin's prefix. */
export function logError(...details: unknown[]): void {
  console.error("[vim-mode]", ...details);
}
