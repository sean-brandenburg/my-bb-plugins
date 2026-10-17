import { definePluginApp } from "@get-bb/plugin-sdk/app";
import "bb-motion/motion.css";
import { Dashboard } from "./ui/Dashboard.js";

export default definePluginApp((app) => {
  app.slots.homepageSection({ id: "dashboard", title: "Dashboard", component: Dashboard });
});
