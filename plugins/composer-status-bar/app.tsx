import { definePluginApp } from "@get-bb/plugin-sdk/app";
import "bb-motion/motion.css";
import { mountComposerStatusBar } from "./footer-style.js";
import { watchPickerShortcut } from "./picker-shortcut.js";
import { FooterStatus } from "./status.js";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "composer-footer-style",
    mount: () => mountComposerStatusBar(document),
  });
  app.contentScripts.register({
    id: "model-picker-shortcut",
    mount: () => watchPickerShortcut(window),
  });
  app.composer.customize({
    id: "composer-status",
    scopes: ["thread"],
    banners: [{ id: "footer-status", chrome: "bare", component: FooterStatus }],
  });
});
