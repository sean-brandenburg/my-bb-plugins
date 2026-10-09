import { useEffect } from "react";
import { definePluginApp, useSettings } from "@get-bb/plugin-sdk/app";
import { NERD_FONT_ATTRIBUTE, ensureNerdFont } from "./lib";
import { forcedGlyphs } from "./settings";

function GlyphSetting() {
  const { values, isLoading } = useSettings();
  const forced = isLoading ? null : forcedGlyphs(values?.glyphs);
  useEffect(() => {
    ensureNerdFont();
    const root = document.documentElement;
    if (forced === null) root.removeAttribute(NERD_FONT_ATTRIBUTE);
    else root.setAttribute(NERD_FONT_ATTRIBUTE, forced);
    return () => root.removeAttribute(NERD_FONT_ATTRIBUTE);
  }, [forced]);
  return null;
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "glyph-setting", component: GlyphSetting });
});
