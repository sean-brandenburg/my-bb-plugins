import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import "bb-motion/motion.css";
import { PreferencesSync } from "./app/preferences/PreferencesSync.js";
import { useFollowNavigation } from "./app/model/use-follow-navigation.js";
import { ProjectPicker } from "./app/picker/ProjectPicker.js";
import {
  toggleProjectPicker,
  useToggleProjectPickerEvent,
} from "./app/picker/picker-store.js";

// Owning the thread-list slot is what keeps bb's own list out of the sidebar;
// projects and threads live in the picker instead.
function EmptyThreadList() {
  return <PreferencesSync />;
}

function ProjectPickerOverlay() {
  useFollowNavigation();
  useToggleProjectPickerEvent();
  // The picker has no tooltips of its own; the provider stays because the
  // preview's ThreadChat is a host component rendered in this React root.
  return (
    <TooltipProvider>
      <PreferencesSync />
      <ProjectPicker />
    </TooltipProvider>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "thread-list",
    title: "Project switcher",
    description:
      "Leaves the sidebar free of projects and threads; double Shift opens a keyboard-first project and thread picker.",
    component: EmptyThreadList,
  });
  app.slots.experimental_appOverlay({
    id: "project-picker",
    component: ProjectPickerOverlay,
  });
  app.commands.register({
    id: "switch-project",
    title: "Switch project",
    run: () => toggleProjectPicker(),
  });
});
