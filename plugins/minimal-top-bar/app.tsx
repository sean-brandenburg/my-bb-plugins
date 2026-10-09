import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { mountMinimalTopBar } from "./top-bar.js";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "minimal-top-bar",
    mount: () => mountMinimalTopBar(document, window),
  });
});
