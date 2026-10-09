import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { stepHistory } from "./history.js";

export default definePluginApp((app) => {
  app.commands.register({
    id: "history-back",
    title: "Go back",
    defaultShortcut: { key: "o", control: true },
    run: () => stepHistory(document, window, "back"),
  });
  app.commands.register({
    id: "history-forward",
    title: "Go forward",
    defaultShortcut: { key: "i", control: true },
    run: () => stepHistory(document, window, "forward"),
  });
});
