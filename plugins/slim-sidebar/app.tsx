import { definePluginApp } from "@get-bb/plugin-sdk/app";
import "bb-motion/motion.css";
import { mountSlimSidebar } from "./layout.js";
import { SlimNavigation } from "./rail.js";
import { activateRailSlot, RAIL_SLOT_COUNT, railSlotAvailable } from "./slots.js";

export default definePluginApp((app) => {
  app.slots.experimental_sidebarNavigation({
    id: "slim-navigation",
    title: "Slim icon rail",
    description: "Icon-only navigation with tooltips, for the slim sidebar.",
    component: ({ isCompactViewport, experimental_Original: Original }) =>
      isCompactViewport ? <Original /> : <SlimNavigation />,
  });
  // bb's own thread.jump.N defaults hold Mod+1–9, so these stay unbound until those are cleared in Settings → Keyboard.
  for (let slot = 1; slot <= RAIL_SLOT_COUNT; slot += 1) {
    app.commands.register({
      id: `rail-item-${slot}`,
      title: `Open sidebar item ${slot}`,
      defaultShortcut: { key: String(slot), mod: true },
      isAvailable: () => railSlotAvailable(slot),
      run: () => activateRailSlot(slot),
    });
  }
  app.contentScripts.register({
    id: "slim-sidebar-layout",
    mount: () => mountSlimSidebar(document, window),
  });
});
