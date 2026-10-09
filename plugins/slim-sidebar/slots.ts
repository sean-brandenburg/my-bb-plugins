/** Mod+1 through Mod+9 open the rail's visible items in order. */
export const RAIL_SLOT_COUNT = 9;

export interface RailSlotItem {
  id: string;
  /** Disabled and still-loading items keep their number, so the ones after them don't shift. */
  enabled: boolean;
}

interface Rail {
  items: readonly RailSlotItem[];
  activate: (itemId: string) => void;
}

/**
 * Commands run outside React, so the mounted rail publishes what it shows here.
 * Nothing is published on compact viewports, where bb's own navigation renders.
 */
let rail: Rail | null = null;

export function publishRail(items: readonly RailSlotItem[], activate: (itemId: string) => void): () => void {
  const entry: Rail = { items, activate };
  rail = entry;
  return () => {
    if (rail === entry) rail = null;
  };
}

/** `slot` is 1-based, matching the digit pressed. */
export function railSlotAvailable(slot: number): boolean {
  return rail?.items[slot - 1]?.enabled === true;
}

export function activateRailSlot(slot: number): void {
  const item = rail?.items[slot - 1];
  if (rail !== null && item?.enabled === true) rail.activate(item.id);
}

/** The default binding's label; a user rebinding in Settings → Keyboard isn't visible to plugins. */
export function railSlotLabel(index: number, platform: string): string | null {
  if (index < 0 || index >= RAIL_SLOT_COUNT) return null;
  return /mac|iphone|ipad/iu.test(platform) ? `⌘${index + 1}` : `Ctrl+${index + 1}`;
}
