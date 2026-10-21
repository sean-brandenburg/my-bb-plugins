import { definePluginApp } from "@get-bb/plugin-sdk/app";
import "bb-motion/motion.css";
import { mountTopBarFrame } from "./frame.js";
import { mountMinimalTopBar } from "./top-bar.js";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "minimal-top-bar",
    mount: () => mountMinimalTopBar(document, window),
  });
  app.contentScripts.register({
    id: "top-bar-frame",
    mount: () => mountTopBarFrame(document, window),
  });
});
