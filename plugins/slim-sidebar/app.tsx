import { definePluginApp } from "@get-bb/plugin-sdk/app";
import "bb-motion/motion.css";
import { mountSlimSidebar } from "./layout.js";
import { SlimNavigation } from "./rail.js";

export default definePluginApp((app) => {
  app.slots.experimental_sidebarNavigation({
    id: "slim-navigation",
    title: "Slim icon rail",
    description: "Icon-only navigation with tooltips, for the slim sidebar.",
    component: ({ isCompactViewport, experimental_Original: Original }) =>
      isCompactViewport ? <Original /> : <SlimNavigation />,
  });
  app.contentScripts.register({
    id: "slim-sidebar-layout",
    mount: () => mountSlimSidebar(document, window),
  });
});
