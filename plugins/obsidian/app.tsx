import { definePluginApp } from "@get-bb/plugin-sdk/app";
import "bb-motion/motion.css";
import { CaptureOverlay, captureText, openCaptureDialog, openToday, startRoutine } from "./ui/daily";
import { backlinksTab, outlineTab } from "./ui/fixed-tabs";
import { searchVault } from "./ui/global-keys";
import { PANEL_PATH } from "./ui/navigation";
import { toggleVaultViewMode, vaultPageShown } from "./ui/vault-keys";
import { VaultPage } from "./ui/VaultPage";
import "./ui/vault.css";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "vault",
    title: "Vault",
    icon: "./assets/icon.svg",
    path: PANEL_PATH,
    component: VaultPage,
    fixedTabs: [outlineTab, backlinksTab],
  });
  app.slots.experimental_appOverlay({ id: "capture", component: CaptureOverlay });
  app.slots.messageAction({
    id: "save-to-daily",
    title: "Save to today's daily note",
    icon: "obsidian/vault",
    run: ({ message, selectedText, threadId }) => captureText(selectedText ?? message.text, threadId),
  });
  app.commands.register({
    id: "log-to-today",
    title: "Vault: Log to today's daily note",
    defaultShortcut: { key: "l", mod: true, shift: true },
    run: ({ threadId }) => openCaptureDialog({ threadId: threadId ?? undefined }),
  });
  app.commands.register({
    id: "toggle-view-mode",
    title: "Vault: Switch between editing and reading view",
    defaultShortcut: { key: "e", mod: true },
    isAvailable: vaultPageShown,
    run: toggleVaultViewMode,
  });
  app.commands.register({
    id: "search-vault",
    title: "Vault: Search the vault",
    defaultShortcut: { key: "f", mod: true, shift: true },
    isAvailable: vaultPageShown,
    run: searchVault,
  });
  app.commands.register({ id: "open-today", title: "Vault: Open today's daily note", run: () => openToday() });
  app.commands.register({ id: "start-day", title: "Vault: Start day (/daily-note start)", run: () => startRoutine("start") });
  app.commands.register({ id: "wrap-day", title: "Vault: Wrap up day (/daily-note wrap)", run: () => startRoutine("wrap") });
});
