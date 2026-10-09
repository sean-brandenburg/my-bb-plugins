import { definePluginApp } from "@get-bb/plugin-sdk/app";
import "./lib/motion.css";
import "./shell.css";

// bb keeps a plugin's stylesheet active for as long as one of its content
// scripts is mounted, so this empty script is what makes the shell motion
// app-wide.
export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "motion-shell",
    mount: () => () => {},
  });
});
