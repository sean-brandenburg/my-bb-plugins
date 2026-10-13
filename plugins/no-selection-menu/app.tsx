import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { mountNoSelectionMenu } from "./selection-menu.js";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "no-selection-menu",
    mount: () => mountNoSelectionMenu(document),
  });
});
