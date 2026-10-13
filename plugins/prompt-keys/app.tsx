import { definePluginApp } from "@get-bb/plugin-sdk/app";
import "bb-motion/motion.css";
import { mountPromptKeys } from "./prompt-keys.js";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "prompt-keys",
    mount: () => mountPromptKeys(document, window),
  });
});
