import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActivityEvent, Summary } from "./contract";
import plugin from "./server";

type Host = ReturnType<typeof createFakePluginHost>;
let host: Host;

const NOW = Date.UTC(2026, 9, 21, 12);
const DAY = 86_400_000;

const event = (overrides: Partial<ActivityEvent>): ActivityEvent => ({
  at: NOW,
  kind: "click",
  plugin: "kanban",
  route: "/plugins/kanban/board",
  key: "Refresh board",
  label: "Refresh board",
  via: "pointer",
  count: null,
  ...overrides,
});

beforeEach(async () => {
  host = createFakePluginHost({ pluginId: "activity" });
  await plugin(host.bb);
});

afterEach(async () => {
  await host.harness.lifecycle.dispose();
});

async function seed() {
  await host.harness.behavior.callRpc("record", {
    events: [
      event({}),
      event({ at: NOW - 60_000, via: "keyboard" }),
      event({ at: NOW - 2 * DAY, key: "Submit review", label: "Submit review" }),
      event({ kind: "command", plugin: "kanban", key: "gg", label: "gg", via: null }),
      event({ kind: "command", plugin: "obsidian", route: "/plugins/obsidian/vault", key: "j", label: "j", via: null, count: 5 }),
      event({ kind: "key", plugin: null, route: "/threads/*", key: "<D-k>", label: "<D-k>", via: null }),
      event({ kind: "route", plugin: null, route: "/threads/*", key: "/threads/*", label: "/threads/*", via: null, at: NOW - 40 * DAY }),
    ],
  });
}

describe("activity server", () => {
  it("ranks what was recorded, by plugin and by control, within a range", async () => {
    await seed();
    const all = (await host.harness.behavior.callRpc("summary", { sinceMs: null, kind: null, plugin: null, limit: 100 })) as Summary;
    expect(all.total).toBe(7);
    expect(all.plugins).toEqual([
      { plugin: "kanban", count: 4 },
      { plugin: null, count: 2 },
      { plugin: "obsidian", count: 1 },
    ]);
    expect(all.items[0]).toEqual({ plugin: "kanban", kind: "click", key: "Refresh board", label: "Refresh board", count: 2, pointer: 1, keyboard: 1, lastAt: NOW });
    expect(all.firstAt).toBe(NOW - 40 * DAY);

    const week = (await host.harness.behavior.callRpc("summary", { sinceMs: NOW - 7 * DAY, kind: null, plugin: null, limit: 100 })) as Summary;
    expect(week.total).toBe(6);

    const bbKeys = (await host.harness.behavior.callRpc("summary", { sinceMs: null, kind: "key", plugin: "bb", limit: 100 })) as Summary;
    expect(bbKeys.items.map((item) => item.key)).toEqual(["<D-k>"]);

    const commands = (await host.harness.behavior.callRpc("summary", { sinceMs: null, kind: "command", plugin: null, limit: 100 })) as Summary;
    expect(commands.items.map((item) => [item.plugin, item.key])).toEqual([
      ["kanban", "gg"],
      ["obsidian", "j"],
    ]);
  });

  it("refuses a batch over the limit or with a bad shape", async () => {
    await expect(host.harness.behavior.callRpc("record", { events: [{ ...event({}), kind: "hover" }] })).rejects.toThrow();
    await expect(host.harness.behavior.callRpc("record", { events: Array.from({ length: 501 }, () => event({})) })).rejects.toThrow();
  });

  it("answers bb activity top, plugins, recent, and prune", async () => {
    await seed();
    const top = await host.harness.behavior.runCli(["top", "--since", "all", "--limit", "3"]);
    expect(top.exitCode).toBe(0);
    expect(String(top.stdout)).toContain("7 events");
    expect(String(top.stdout)).toContain("Refresh board");
    expect(String(top.stdout)).toContain("1 mouse / 1 keys");

    const clicks = await host.harness.behavior.runCli(["top", "--kind", "click", "--plugin", "kanban", "--json"]);
    const parsed = JSON.parse(String(clicks.stdout)) as Summary;
    expect(parsed.items.map((item) => item.key)).toEqual(["Refresh board", "Submit review"]);

    const plugins = await host.harness.behavior.runCli(["plugins", "--since", "all"]);
    expect(String(plugins.stdout).split("\n")).toEqual(["count  plugin", "4      kanban", "2      bb", "1      obsidian"]);

    const recent = await host.harness.behavior.runCli(["recent", "--limit", "2", "--json"]);
    const events = JSON.parse(String(recent.stdout)) as ActivityEvent[];
    expect(events.map((row) => row.key)).toEqual(["/threads/*", "<D-k>"]);

    const bad = await host.harness.behavior.runCli(["top", "--since", "soon"]);
    expect(bad.exitCode).not.toBe(0);

    const pruned = await host.harness.behavior.runCli(["prune", "--before", "30d"]);
    expect(String(pruned.stdout)).toBe("Deleted 1 events.");
    const after = (await host.harness.behavior.callRpc("summary", { sinceMs: null, kind: null, plugin: null, limit: 1 })) as Summary;
    expect(after.total).toBe(6);
  });
});
