import { DEFAULT_OPTIONS, type VimModeOptions } from "./vim/options";

export const SCOPE_ALL = "All text boxes";
export const SCOPE_COMPOSER = "Prompt box only";

/** Declarative settings, shared by the server (definition) and app (reading). */
export const settingDescriptors = {
  enabled: {
    type: "boolean" as const,
    label: "Enable vim keys",
    description: "Turn vim editing on or off without uninstalling the plugin.",
    default: true,
  },
  scope: {
    type: "select" as const,
    label: "Text boxes",
    description:
      "Where vim keys apply. Command palettes, pickers, terminals, and code editors are always left alone.",
    options: [SCOPE_ALL, SCOPE_COMPOSER],
    default: SCOPE_ALL,
  },
  startInInsertMode: {
    type: "boolean" as const,
    label: "Start in insert mode",
    description:
      "Text boxes enter insert mode whenever they gain focus, so typing works as usual until you press Escape. Turn off to start in normal mode.",
    default: true,
  },
  escapeLeavesTextBox: {
    type: "boolean" as const,
    label: "Escape leaves the text box",
    description:
      "In normal mode with nothing pending, Escape passes to bb, which blurs the text box or closes the dialog. Off keeps focus in the text box.",
    default: false,
  },
};

type SettingValues = Record<string, string | number | boolean>;
type BooleanOption = "enabled" | "startInInsertMode" | "escapeLeavesTextBox";

function booleanOption(values: SettingValues, key: BooleanOption): boolean {
  const value = values[key];
  return typeof value === "boolean" ? value : DEFAULT_OPTIONS[key];
}

export function optionsFromSettings(values: SettingValues | undefined): VimModeOptions {
  if (!values) return DEFAULT_OPTIONS;
  return {
    enabled: booleanOption(values, "enabled"),
    scope: values.scope === SCOPE_COMPOSER ? "composer" : "all",
    startInInsertMode: booleanOption(values, "startInInsertMode"),
    escapeLeavesTextBox: booleanOption(values, "escapeLeavesTextBox"),
  };
}
