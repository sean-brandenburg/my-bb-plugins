import { useEffect } from "react";
import { definePluginApp, useSdk } from "@get-bb/plugin-sdk/app";
import {
  createDoubleShiftDetector,
  findCommandShortcut,
  isMacPlatform,
  requestProjectPicker,
  shortcutKeydown,
} from "./double-shift.js";

const PALETTE_COMMAND = "palette.open";

// Without the Project switcher, double Shift falls back to bb's palette. bb has
// no API to open it, but its shortcut handler listens on window keydown without
// checking isTrusted, so replaying the palette's current binding opens it. The
// binding is read fresh each time so a rebind in Settings → Keyboard keeps
// working.
function DoubleShiftListener() {
  const sdk = useSdk();
  useEffect(() => {
    const isMac = isMacPlatform(navigator.userAgent);
    const openPalette = () => {
      void sdk.system
        .config()
        .then((config) => {
          const shortcut = findCommandShortcut(
            config.keybindings,
            PALETTE_COMMAND,
          );
          if (shortcut === null) {
            console.warn(
              "double-shift-palette: the quick palette has no shortcut to replay",
            );
            return;
          }
          const target =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : document.body;
          target.dispatchEvent(shortcutKeydown(shortcut, isMac));
        })
        .catch((error: unknown) => {
          console.warn(
            `double-shift-palette: reading keybindings failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    };
    const detector = createDoubleShiftDetector(() => {
      if (!requestProjectPicker(window)) openPalette();
    });
    const onPointerDown = () => detector.reset();
    window.addEventListener("keydown", detector.keydown, true);
    window.addEventListener("keyup", detector.keyup, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", detector.reset);
    return () => {
      window.removeEventListener("keydown", detector.keydown, true);
      window.removeEventListener("keyup", detector.keyup, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", detector.reset);
    };
  }, [sdk]);
  return null;
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({
    id: "double-shift-listener",
    component: DoubleShiftListener,
  });
});
