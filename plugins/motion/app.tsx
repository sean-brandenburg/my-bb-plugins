import { definePluginApp } from "@get-bb/plugin-sdk/app";
import "./lib/motion.css";
import "./shell.css";
import { watchTimelineEntrances } from "./timeline-entrance";

// bb keeps a plugin's stylesheet active for as long as one of its content
// scripts is mounted, so this script is also what makes the shell motion
// app-wide.
export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "motion-shell",
    mount: () => watchTimelineEntrances(),
  });
});
