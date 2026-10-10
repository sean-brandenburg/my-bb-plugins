import { BacklinksPanel, OutlinePanel } from "./Panels";

/** Right-panel tabs of the Vault page; its files are in the page's own left sidebar. The objects double as references for openFixedTab. */
export const outlineTab = { panelId: "vault", id: "outline", title: "Outline", icon: "ListView", component: OutlinePanel, layout: "flush" } as const;
export const backlinksTab = { panelId: "vault", id: "backlinks", title: "Backlinks", icon: "Link", component: BacklinksPanel, layout: "flush" } as const;
