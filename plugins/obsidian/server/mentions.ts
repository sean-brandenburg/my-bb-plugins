// "@" mentions that attach a vault note, or today's daily note, to a thread as context.
import nodePath from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { isNotePath, noteTitle } from "../shared/obsidian.ts";
import type { VaultAccess } from "./daily.ts";
import { excerpt } from "./text.ts";

const MENTION_RESULTS = 8;
const MENTION_CONTEXT_LIMIT = 60_000;
const TODAY_ITEM_ID = "today";
const ICON = "obsidian/vault";

export function registerVaultMentions(bb: BbPluginApi, vault: VaultAccess, todayPath: () => Promise<string>) {
  bb.ui.registerMentionProvider({
    id: "vault",
    label: "Vault notes",
    async search({ query }) {
      const needle = query.trim().toLowerCase();
      const items: { id: string; title: string; subtitle?: string; icon?: string }[] = [];
      if (needle === "" || "today".startsWith(needle) || "daily".startsWith(needle)) {
        items.push({ id: TODAY_ITEM_ID, title: `Today's daily note`, subtitle: await todayPath(), icon: ICON });
      }
      const tree = await vault.tree().catch(() => null);
      if (tree === null) return items;
      const notes = tree.files.filter((file) => isNotePath(file.path));
      const ranked = notes
        .map((file) => {
          const title = noteTitle(file.path).toLowerCase();
          const path = file.path.toLowerCase();
          const score = needle === "" ? file.mtimeMs : title.startsWith(needle) ? 3 : title.includes(needle) ? 2 : path.includes(needle) ? 1 : 0;
          return { file, score };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || b.file.mtimeMs - a.file.mtimeMs)
        .slice(0, MENTION_RESULTS);
      for (const { file } of ranked) items.push({ id: file.path, title: noteTitle(file.path), subtitle: file.path, icon: ICON });
      return items;
    },
    async resolve(itemId) {
      const path = itemId === TODAY_ITEM_ID ? await todayPath() : itemId;
      const note = await vault.read(path);
      const absolute = nodePath.join(await vault.vaultPath(), path);
      if (note === null) return { context: `The Obsidian note ${path} does not exist yet (vault file ${absolute}).` };
      return { context: `Obsidian note "${path}" (file: ${absolute}):\n\n${excerpt(note.content, MENTION_CONTEXT_LIMIT)}` };
    },
  });
}
