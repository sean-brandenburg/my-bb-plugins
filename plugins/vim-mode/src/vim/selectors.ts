// Page markup the plugin depends on or adds. bb's selectors track its markup,
// so a bb DOM change should only need edits here.

/** Marks every node the plugin adds to the page; such nodes are never vim targets. */
export const UI_ATTRIBUTE = "data-bb-vim-ui";

/** Lets other plugins opt a subtree's text boxes out of vim. */
export const VIM_IGNORE_ATTRIBUTE = "data-vim-ignore";

/** bb's prompt box (the composer form). */
export const PROMPTBOX = "[data-promptbox]";
/** The @-mention / slash-command menu bb opens inside the prompt box. */
export const PROMPTBOX_TYPEAHEAD_MENU = "[data-promptbox-typeahead-menu]";
/** Set on the prompt box while voice input is recording. */
export const PROMPTBOX_VOICE_ACTIVE_ATTRIBUTE = "data-promptbox-voice-active";

// Terminals and Monaco handle their own keys; the helper textareas they focus
// must never become vim targets.
export const EXCLUDED_CONTAINERS = `[${UI_ATTRIBUTE}], [${VIM_IGNORE_ATTRIBUTE}], .xterm, .monaco-editor`;
