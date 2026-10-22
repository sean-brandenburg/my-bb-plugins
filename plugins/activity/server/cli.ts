import { type BbPluginApi, PluginCliError, cliCommand, defineCli } from "@get-bb/plugin-sdk";
import { KINDS, type StoredEvent, type SummaryItem } from "../contract";
import { parseSince } from "./since";
import type { Store } from "./store";

const SINCE = { type: "string" as const, description: "How far back: 7d (default), 30d, 12h, 2w, or all" };

function since(text: string | undefined): number | null {
  const parsed = parseSince(text ?? "7d", Date.now());
  if (parsed === undefined) throw new PluginCliError(`Can't read --since ${text}.`, { code: "invalid_value", hint: "Use a number and unit (30d, 12h, 2w) or all." });
  return parsed;
}

const pluginName = (plugin: string | null) => plugin ?? "bb";

function table(rows: string[][]): string {
  const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => row[column]!.length)));
  return rows.map((row) => row.map((cell, column) => (column === row.length - 1 ? cell : cell.padEnd(widths[column]!))).join("  ").trimEnd()).join("\n");
}

function viaColumn(item: SummaryItem): string {
  if (item.kind !== "click") return "";
  return `${item.pointer} mouse / ${item.keyboard} keys`;
}

function formatItems(items: SummaryItem[]): string {
  if (items.length === 0) return "Nothing recorded in that range.";
  return table([["count", "plugin", "kind", "what", "clicked via"], ...items.map((item) => [String(item.count), pluginName(item.plugin), item.kind, item.label === item.key ? item.key : `${item.label}  (${item.key})`, viaColumn(item)])]);
}

function formatRecent(events: StoredEvent[]): string {
  if (events.length === 0) return "Nothing recorded yet.";
  return table([
    ["when", "plugin", "kind", "what", "route"],
    ...events.map((event) => [new Date(event.at).toISOString().slice(0, 19).replace("T", " "), pluginName(event.plugin), event.kind, event.count === null ? event.label : `${event.count}${event.label}`, event.route]),
  ]);
}

/** `bb activity …`: the log from the terminal, for pruning decisions and for agents asked about usage. */
export function registerCli(bb: BbPluginApi, store: Store): void {
  bb.cli.register(
    defineCli({
      name: "activity",
      summary: "How bb and its plugins get used: clicks, key commands, and pages, ranked",
      commands: {
        top: cliCommand({
          summary: "Most-used controls and keys",
          options: {
            since: SINCE,
            kind: { type: "enum", values: KINDS, description: "Only clicks, commands (vim keys a plugin ran), keys (raw, unbound), or routes" },
            plugin: { type: "string", description: "Only this plugin id, or bb for bb's own UI" },
            limit: { type: "integer", min: 1, max: 5000, default: 50, description: "How many rows" },
            json: { type: "boolean", description: "Emit JSON" },
          },
          run({ options }) {
            const summary = store.summary({ sinceMs: since(options.since), kind: options.kind ?? null, plugin: options.plugin ?? null, limit: options.limit });
            if (options.json) return { exitCode: 0, stdout: JSON.stringify(summary) };
            return { exitCode: 0, stdout: `${summary.total} events\n\n${formatItems(summary.items)}` };
          },
        }),
        plugins: cliCommand({
          summary: "Events per plugin",
          options: { since: SINCE, json: { type: "boolean", description: "Emit JSON" } },
          run({ options }) {
            const summary = store.summary({ sinceMs: since(options.since), kind: null, plugin: null, limit: 1 });
            if (options.json) return { exitCode: 0, stdout: JSON.stringify(summary.plugins) };
            if (summary.plugins.length === 0) return { exitCode: 0, stdout: "Nothing recorded in that range." };
            return { exitCode: 0, stdout: table([["count", "plugin"], ...summary.plugins.map((row) => [String(row.count), pluginName(row.plugin)])]) };
          },
        }),
        recent: cliCommand({
          summary: "The latest events, newest first",
          options: {
            limit: { type: "integer", min: 1, max: 1000, default: 50, description: "How many events" },
            json: { type: "boolean", description: "Emit JSON" },
          },
          run({ options }) {
            const events = store.recent(options.limit);
            return { exitCode: 0, stdout: options.json ? JSON.stringify(events) : formatRecent(events) };
          },
        }),
        prune: cliCommand({
          summary: "Delete events older than a cutoff",
          options: { before: { type: "string", required: true, description: "Age to keep: 90d deletes everything older than 90 days" } },
          run({ options }) {
            const cutoff = parseSince(options.before, Date.now());
            if (cutoff === undefined || cutoff === null) throw new PluginCliError(`Can't read --before ${options.before}.`, { code: "invalid_value", hint: "Use a number and unit: 90d, 12h, 2w." });
            return { exitCode: 0, stdout: `Deleted ${store.prune(cutoff)} events.` };
          },
        }),
      },
    }),
  );
}
