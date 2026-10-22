// Opening notes on the Vault page and jumping to a line, heading, or block in them.
import { useCallback, useSyncExternalStore } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { isDateKey } from "../shared/daily";
import type { NavigationTarget } from "../shared/note-text";
import { safeDecode } from "../shared/obsidian";
import { createStore } from "./state";

export const PANEL_PATH = "vault";

/** The calendar view's subPath; a colon can't start a note's name, so it can't collide with one. */
export const CALENDAR_PREFIX = ":calendar";

export function calendarSubPath(dateKey?: string): string {
  return dateKey === undefined ? CALENDAR_PREFIX : `${CALENDAR_PREFIX}/${dateKey}`;
}

/** The day a calendar subPath shows (today when it names none or a bad one); null for anything else. */
export function calendarDateOf(subPath: string, todayKey: string): string | null {
  const path = decodeNotePath(subPath);
  if (path === CALENDAR_PREFIX) return todayKey;
  if (!path.startsWith(`${CALENDAR_PREFIX}/`)) return null;
  const date = path.slice(CALENDAR_PREFIX.length + 1);
  return isDateKey(date) ? date : todayKey;
}

/** The host percent-encodes subPath when navigating but hands it back still encoded. */
export function decodeNotePath(subPath: string): string {
  return subPath.split("/").filter(Boolean).map(safeDecode).join("/");
}

export interface NavigationRequest {
  path: string;
  target: NavigationTarget;
  /** False leaves focus where it is, so keys like n keep working after the jump. */
  focus: boolean;
  seq: number;
}

const navigationRequests = createStore<NavigationRequest | null>(null);
let navigationSeq = 0;

export function requestNavigation(path: string, target: NavigationTarget, focus = true): void {
  navigationSeq += 1;
  navigationRequests.set({ path, target, focus, seq: navigationSeq });
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
    (path: string, options: { target?: NavigationTarget; replace?: boolean; focus?: boolean } = {}) => {
      if (options.target !== undefined) requestNavigation(path, options.target, options.focus);
      navigate.toPluginPanel(PANEL_PATH, { subPath: path, replace: options.replace });
    },
    [navigate],
  );
}
