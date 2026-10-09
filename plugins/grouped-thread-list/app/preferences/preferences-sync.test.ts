// @vitest-environment jsdom

import { getDefaultStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRemotePreferenceSignal,
  attachPreferencesStore,
  flushPreferenceWritesForTest,
  hydratePreferences,
  hydratePreferencesFromMirror,
  preferencesMirrorStorageKey,
  preferencesReadyAtom,
  resetPreferencesSyncForTest,
  setPreferencesMirrorStorageForTest,
  type PreferencesRpc,
} from "./preferences-sync.js";
import { createSyncedPreferenceAtom } from "./synced-preference-atom.js";
import { defaultPreferences } from "../../shared/preferences.js";

function fakeRpc(
  preferences: Record<string, unknown> = {},
): PreferencesRpc & { calls: { method: string; input: unknown }[] } {
  const calls: { method: string; input: unknown }[] = [];
  return {
    calls,
    async call(method: string, input: unknown) {
      calls.push({ method, input });
      if (method === "listPreferences") {
        return { preferences: { ...defaultPreferences(), ...preferences } };
      }
      return input;
    },
  };
}

function memoryStorage(): Storage {
  const rows = new Map<string, string>();
  return {
    get length() {
      return rows.size;
    },
    clear: () => rows.clear(),
    getItem: (key) => rows.get(key) ?? null,
    key: (index) => [...rows.keys()][index] ?? null,
    removeItem: (key) => {
      rows.delete(key);
    },
    setItem: (key, value) => {
      rows.set(key, String(value));
    },
  };
}

const MIRROR_KEY = preferencesMirrorStorageKey("thread-list");

let mirror: Storage;

beforeEach(() => {
  vi.useFakeTimers();
  mirror = memoryStorage();
  setPreferencesMirrorStorageForTest(mirror);
  attachPreferencesStore(getDefaultStore(), "thread-list");
});

afterEach(() => {
  resetPreferencesSyncForTest();
  setPreferencesMirrorStorageForTest(undefined);
  vi.useRealTimers();
});

describe("preferences sync", () => {
  it("hydrates from the server, marks ready, and mirrors to localStorage", async () => {
    const store = getDefaultStore();
    const projectAtom = createSyncedPreferenceAtom("activeProject");
    expect(store.get(preferencesReadyAtom())).toBe(false);
    await hydratePreferences(fakeRpc({ activeProject: "proj_a" }));
    expect(store.get(preferencesReadyAtom())).toBe(true);
    expect(store.get(projectAtom)).toBe("proj_a");
    expect(JSON.parse(mirror.getItem(MIRROR_KEY) ?? "{}").activeProject).toBe(
      "proj_a",
    );
  });

  it("paints from the mirror before the server answers and ignores junk in it", () => {
    const store = getDefaultStore();
    const projectAtom = createSyncedPreferenceAtom("activeProject");
    mirror.setItem(MIRROR_KEY, JSON.stringify({ activeProject: "proj_b" }));
    expect(hydratePreferencesFromMirror()).toBe(true);
    expect(store.get(projectAtom)).toBe("proj_b");
    mirror.setItem(MIRROR_KEY, JSON.stringify({ activeProject: 42 }));
    expect(hydratePreferencesFromMirror()).toBe(true);
    expect(store.get(projectAtom)).toBe("proj_b");
    mirror.setItem(MIRROR_KEY, "{not json");
    expect(hydratePreferencesFromMirror()).toBe(false);
  });

  it("keys the mirror by plugin id, so a renamed copy keeps its own state", async () => {
    expect(MIRROR_KEY).toBe("bb.thread-list.preferences.v1");
    mirror.setItem(MIRROR_KEY, JSON.stringify({ activeProject: "proj_b" }));
    attachPreferencesStore(getDefaultStore(), "my-switcher");

    expect(hydratePreferencesFromMirror()).toBe(false);
    await hydratePreferences(fakeRpc({ activeProject: "proj_a" }));

    expect(
      JSON.parse(mirror.getItem("bb.my-switcher.preferences.v1") ?? "{}")
        .activeProject,
    ).toBe("proj_a");
    expect(JSON.parse(mirror.getItem(MIRROR_KEY) ?? "{}").activeProject).toBe(
      "proj_b",
    );
  });

  it("applies a local write immediately and coalesces the server write", async () => {
    const rpc = fakeRpc();
    await hydratePreferences(rpc);
    const store = getDefaultStore();
    const projectAtom = createSyncedPreferenceAtom("activeProject");
    store.set(projectAtom, "proj_a");
    store.set(projectAtom, "proj_b");
    expect(store.get(projectAtom)).toBe("proj_b");
    expect(
      rpc.calls.filter((call) => call.method === "setPreference"),
    ).toHaveLength(0);
    vi.advanceTimersByTime(200);
    await flushPreferenceWritesForTest();
    expect(rpc.calls.filter((call) => call.method === "setPreference")).toEqual(
      [
        {
          method: "setPreference",
          input: { key: "activeProject", value: "proj_b" },
        },
      ],
    );
  });

  it("takes a remote change from another window unless a local write is pending", async () => {
    const rpc = fakeRpc();
    await hydratePreferences(rpc);
    const store = getDefaultStore();
    const projectAtom = createSyncedPreferenceAtom("activeProject");
    applyRemotePreferenceSignal({ key: "activeProject", value: "proj_a" });
    expect(store.get(projectAtom)).toBe("proj_a");
    applyRemotePreferenceSignal({ key: "activeProject", value: "" });
    expect(store.get(projectAtom)).toBe("proj_a");
    applyRemotePreferenceSignal({ key: "nope", value: 1 });
    expect(store.get(projectAtom)).toBe("proj_a");

    store.set(projectAtom, "proj_local");
    applyRemotePreferenceSignal({ key: "activeProject", value: "proj_remote" });
    expect(store.get(projectAtom)).toBe("proj_local");
    vi.advanceTimersByTime(200);
    await flushPreferenceWritesForTest();
    applyRemotePreferenceSignal({ key: "activeProject", value: "proj_remote" });
    expect(store.get(projectAtom)).toBe("proj_remote");
  });

  it("does not write back a value that did not change", async () => {
    const rpc = fakeRpc();
    await hydratePreferences(rpc);
    const store = getDefaultStore();
    store.set(createSyncedPreferenceAtom("activeProject"), null);
    vi.advanceTimersByTime(200);
    await flushPreferenceWritesForTest();
    expect(
      rpc.calls.filter((call) => call.method === "setPreference"),
    ).toHaveLength(0);
  });
});

describe("preferences sync with a provided store", () => {
  it("reads and writes the attached store instead of the default one", async () => {
    const { createStore } = await import("jotai");
    const custom = createStore();
    attachPreferencesStore(custom, "thread-list");
    const projectAtom = createSyncedPreferenceAtom("activeProject");
    await hydratePreferences(fakeRpc({ activeProject: "proj_a" }));
    expect(custom.get(preferencesReadyAtom())).toBe(true);
    expect(custom.get(projectAtom)).toBe("proj_a");
    expect(getDefaultStore().get(preferencesReadyAtom())).toBe(false);
  });
});
