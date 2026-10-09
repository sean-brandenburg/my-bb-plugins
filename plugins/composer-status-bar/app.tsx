import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { mountComposerStatusBar } from "./footer-style.js";
import { FooterStatus } from "./status.js";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "composer-footer-style",
    mount: () => mountComposerStatusBar(document),
  });
  app.composer.customize({
    id: "composer-status",
    scopes: ["thread"],
    banners: [{ id: "footer-status", chrome: "bare", component: FooterStatus }],
  });
});
