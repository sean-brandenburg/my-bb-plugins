// Cross-surface state shared by the Vault page and its right-panel tabs, which
// the host mounts as separate React roots, so it lives in module-level stores.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { PanelTab, SearchStop } from "./vault-nav";

type Listener = () => void;

export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** Each open note's current text, unsaved edits included, for the outline and reading view. */
const liveDocs = createStore<ReadonlyMap<string, string>>(new Map());

export function publishLiveDoc(path: string, content: string): void {
  if (liveDocs.get().get(path) === content) return;
  const next = new Map(liveDocs.get());
  next.set(path, content);
  liveDocs.set(next);
}

export function useLiveDoc(path: string | null): string | null {
  const docs = useSyncExternalStore(liveDocs.subscribe, liveDocs.get);
  return path === null ? null : (docs.get(path) ?? null);
}

/** Each open note's "save now", so moves and deletes can save edits before touching the files. */
const noteFlushers = new Map<string, () => Promise<void>>();

export function registerNoteFlusher(path: string, flush: () => Promise<void>): () => void {
  noteFlushers.set(path, flush);
  return () => {
    if (noteFlushers.get(path) === flush) noteFlushers.delete(path);
  };
}

export async function flushOpenNotes(): Promise<void> {
  await Promise.all([...noteFlushers.values()].map((flush) => flush().catch(() => undefined)));
}

const persistedStores = new Map<string, ReturnType<typeof createStore<unknown>>>();

/**
 * localStorage-backed state shared by every component using the same key, so
 * the page and the sidebar explorer stay in step (expanded folders, view mode).
 */
export function useLocalStorageState<T>(key: string, initial: T) {
  let store = persistedStores.get(key);
  if (store === undefined) {
    let value: unknown = initial;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) value = JSON.parse(stored);
    } catch {
      // Unreadable or disabled storage falls back to the default.
    }
    store = createStore<unknown>(value);
    persistedStores.set(key, store);
  }
  const shared = store;
  const value = useSyncExternalStore(shared.subscribe, shared.get) as T;
  const setValue = useCallback(
    (next: T | ((current: T) => T)) => {
      const resolved = typeof next === "function" ? (next as (current: T) => T)(shared.get() as T) : next;
      shared.set(resolved);
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        // Storage can be full or disabled; the preference just won't persist.
      }
    },
    [shared, key],
  );
  return [value, setValue] as const;
}

/** The note the Vault page shows, so the sidebar explorer can highlight it. */
const currentNote = createStore<string | null>(null);

export function setCurrentNotePath(path: string | null): void {
  if (currentNote.get() !== path) currentNote.set(path);
}

export function useCurrentNotePath(): string | null {
  return useSyncExternalStore(currentNote.subscribe, currentNote.get);
}

/** Search text shared by whichever explorer is showing, so tag clicks land in it. */
const searchQuery = createStore("");

export function useSearchQuery() {
  return [useSyncExternalStore(searchQuery.subscribe, searchQuery.get), searchQuery.set] as const;
}

/** A newly created note whose title should be focused when it opens. */
const titleFocus = createStore<string | null>(null);

export function requestTitleFocus(path: string): void {
  titleFocus.set(path);
}

export function useTitleFocusPath(): string | null {
  return useSyncExternalStore(titleFocus.subscribe, titleFocus.get);
}

/** The last vault search's matches and which one n/N last opened. */
const searchStops = createStore<{ stops: readonly SearchStop[]; index: number | null }>({ stops: [], index: null });

/** Replaces the matches; the same matches again (a search finishing twice) keep n's place. */
export function setSearchStops(stops: readonly SearchStop[]): void {
  const current = searchStops.get();
  const same = current.stops.length === stops.length && current.stops.every((stop, index) => stop.path === stops[index]!.path && stop.line === stops[index]!.line);
  if (!same) searchStops.set({ stops, index: null });
}

export function getSearchStops() {
  return searchStops.get();
}

export function setSearchStopIndex(index: number | null): void {
  searchStops.set({ ...searchStops.get(), index });
}

const keysHelp = createStore(false);

export function setKeysHelpOpen(open: boolean): void {
  keysHelp.set(open);
}

export function useKeysHelpOpen(): boolean {
  return useSyncExternalStore(keysHelp.subscribe, keysHelp.get);
}

/**
 * Right-panel tabs to open. Only the Vault page opens them: the tabs' module graph loops back
 * through the keys, so nothing reachable from a tab may hold the tab definitions.
 */
const panelTabRequest = createStore<PanelTab | null>(null);

export function requestPanelTab(tab: PanelTab): void {
  panelTabRequest.set(tab);
}

/** Calls `open` with each requested tab, once. */
export function usePanelTabRequests(open: (tab: PanelTab) => void): void {
  const tab = useSyncExternalStore(panelTabRequest.subscribe, panelTabRequest.get);
  useEffect(() => {
    if (tab === null) return;
    panelTabRequest.set(null);
    open(tab);
  }, [tab, open]);
}
