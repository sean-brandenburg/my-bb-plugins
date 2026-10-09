import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { mountThreadHeaderProject } from "./header-project.js";
import { HeaderProject } from "./project-label.js";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "thread-header-project-style",
    mount: () => mountThreadHeaderProject(document),
  });
  app.slots.experimental_threadHeaderAction({
    id: "header-project",
    title: "Project",
    component: HeaderProject,
  });
});
