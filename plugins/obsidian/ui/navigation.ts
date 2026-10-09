// Opening notes on the Vault page and jumping to a line, heading, or block in them.
import { useCallback, useSyncExternalStore } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { NavigationTarget } from "../shared/note-text";
import { safeDecode } from "../shared/obsidian";
import { createStore } from "./state";

export const PANEL_PATH = "vault";

/** The host percent-encodes subPath when navigating but hands it back still encoded. */
export function decodeNotePath(subPath: string): string {
  return subPath.split("/").filter(Boolean).map(safeDecode).join("/");
}

export interface NavigationRequest {
  path: string;
  target: NavigationTarget;
  seq: number;
}

const navigationRequests = createStore<NavigationRequest | null>(null);
let navigationSeq = 0;

export function requestNavigation(path: string, target: NavigationTarget): void {
  navigationSeq += 1;
  navigationRequests.set({ path, target, seq: navigationSeq });
}

export function useNavigationRequest(path: string): NavigationRequest | null {
  const request = useSyncExternalStore(navigationRequests.subscribe, navigationRequests.get);
  return request !== null && request.path === path ? request : null;
}

/** Marks a navigation request handled so reopening the note later doesn't jump again. */
export function consumeNavigation(seq: number): void {
  if (navigationRequests.get()?.seq === seq) navigationRequests.set(null);
}

export function useOpenNote() {
  const navigate = useBbNavigate();
  return useCallback(
    (path: string, options: { target?: NavigationTarget; replace?: boolean } = {}) => {
      if (options.target !== undefined) requestNavigation(path, options.target);
      navigate.toPluginPanel(PANEL_PATH, { subPath: path, replace: options.replace });
    },
    [navigate],
  );
}
