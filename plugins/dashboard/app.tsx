import { definePluginApp } from "@get-bb/plugin-sdk/app";
import "bb-motion/motion.css";
import { Usage } from "./ui/Usage.js";

export default definePluginApp((app) => {
  app.slots.homepageSection({ id: "usage", title: "Usage", component: Usage });
});
