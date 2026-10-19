import { definePluginApp } from "@get-bb/plugin-sdk/app";
import "bb-motion/motion.css";
import { mountSettingsKeys } from "./settings-keys.js";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "settings-search",
    mount: () => mountSettingsKeys(document, window),
  });
});
