export type VimScope = "all" | "composer";

export interface VimModeOptions {
  enabled: boolean;
  scope: VimScope;
  startInInsertMode: boolean;
  escapeLeavesTextBox: boolean;
}

export const DEFAULT_OPTIONS: VimModeOptions = {
  enabled: true,
  scope: "all",
  startInInsertMode: true,
  escapeLeavesTextBox: false,
};
