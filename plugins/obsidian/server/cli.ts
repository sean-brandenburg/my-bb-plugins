// The `bb obsidian` CLI, mostly for agents logging to and querying the vault.
import nodePath from "node:path";
import { PLUGIN_CLI_OUTPUT_MAX_BYTES, type BbPluginApi } from "@get-bb/plugin-sdk";
import type { ActivityItem } from "../rpc-contract.ts";
import { formatMeeting } from "../shared/calendar.ts";
import { localDateKey, localTime, parseDateArg } from "../shared/daily.ts";
import { errorMessage } from "../shared/errors.ts";
import type { Daily } from "./daily.ts";
import type { Vault } from "./vault.ts";

const SEARCH_LIMIT = 30;
const ACTIVITY_SUMMARY_LIMIT = 300;
/** Headroom under the CLI output cap for the truncation notice. */
const OUTPUT_HEADROOM_BYTES = 1024;

const USAGE = [
  "Usage:",
  "  bb obsidian log <text…>            Append a timestamped entry to today's daily-note inbox",
  "  bb obsidian today [--content]      Print today's daily-note path (creating it), or its content",
  "  bb obsidian activity [--date D]    bb threads worked on that day (default today) [--json]",
  "  bb obsidian calendar [--date D]    Meetings that day from macOS Calendar (default today) [--all] [--json]",
  "  bb obsidian search <query…>        Full-text search the vault [--json]",
  "  bb obsidian path                   Print the vault's absolute path",
  "  bb obsidian start|wrap             Start a Claude thread running /daily-note start or wrap",
].join("\n");

function bounded(text: string): string {
  const limit = PLUGIN_CLI_OUTPUT_MAX_BYTES - OUTPUT_HEADROOM_BYTES;
  return Buffer.byteLength(text) <= limit ? text : `${Buffer.from(text).subarray(0, limit).toString("utf8")}\n… (truncated)`;
}

export function formatActivity(items: readonly ActivityItem[]): string {
  if (items.length === 0) return "No bb thread activity recorded for that day.";
  return items
    .map((item) => {
      const span = `${localTime(new Date(item.firstAt))}–${localTime(new Date(item.lastAt))}`;
      const summary = item.lastText === "" ? "" : `\n  ${item.lastText.replace(/\n+/g, " ").slice(0, ACTIVITY_SUMMARY_LIMIT)}`;
      return `- ${span} [${item.projectName}] ${item.title} (${item.turns} turn${item.turns === 1 ? "" : "s"}, thread ${item.threadId})${summary}`;
    })
    .join("\n");
}

export function registerCli(bb: BbPluginApi, { vault, daily }: { vault: Vault; daily: Daily }) {
  bb.cli.register({
    name: "obsidian",
    summary: "Log to and query the Obsidian vault (daily notes, activity, search)",
    commands: [
      { name: "log", summary: "Append a timestamped entry to today's daily-note inbox", usage: "bb obsidian log <text…>" },
      { name: "today", summary: "Print today's daily-note path (creating it) or its content", usage: "bb obsidian today [--content]" },
      { name: "activity", summary: "List bb threads worked on for a day", usage: "bb obsidian activity [--date YYYY-MM-DD|today|yesterday] [--json]" },
      {
        name: "calendar",
        summary: "List a day's meetings from macOS Calendar",
        usage: "bb obsidian calendar [--date YYYY-MM-DD|today|yesterday|tomorrow] [--all] [--json]",
      },
      { name: "search", summary: "Full-text search the vault", usage: "bb obsidian search <query…> [--json]" },
      { name: "path", summary: "Print the vault's absolute path", usage: "bb obsidian path" },
      { name: "start", summary: "Start a thread running /daily-note start", usage: "bb obsidian start" },
      { name: "wrap", summary: "Start a thread running /daily-note wrap", usage: "bb obsidian wrap" },
    ],
    async run(argv, context) {
      const json = argv.includes("--json");
      const args = argv.filter((arg) => arg !== "--json");
      const [command, ...rest] = args;
      const fail = (message: string) => ({ exitCode: 1, stderr: message });
      try {
        switch (command) {
          case undefined:
          case "help":
          case "--help":
          case "-h":
            return { exitCode: 0, stdout: USAGE };
          case "log": {
            const text = rest.join(" ").trim();
            if (text === "") return fail("Usage: bb obsidian log <text…>");
            const { path } = await daily.capture(text, context.threadId);
            return { exitCode: 0, stdout: json ? JSON.stringify({ path }) : `Logged to ${path}` };
          }
          case "today": {
            const { path, note } = await daily.ensureDailyNote(localDateKey(new Date()));
            if (rest.includes("--content")) return { exitCode: 0, stdout: bounded(note.content) };
            const absolute = nodePath.join(await vault.access.vaultPath(), path);
            return { exitCode: 0, stdout: json ? JSON.stringify({ path, absolute }) : absolute };
          }
          case "activity": {
            const dateIndex = rest.indexOf("--date");
            const dateKey = parseDateArg(dateIndex === -1 ? undefined : rest[dateIndex + 1]);
            const items = daily.activityFor(dateKey);
            return { exitCode: 0, stdout: bounded(json ? JSON.stringify(items) : formatActivity(items)) };
          }
          case "calendar": {
            const dateIndex = rest.indexOf("--date");
            const dateKey = parseDateArg(dateIndex === -1 ? undefined : rest[dateIndex + 1]);
            const meetings = await daily.meetingsFor(dateKey, rest.includes("--all"));
            if (json) return { exitCode: 0, stdout: bounded(JSON.stringify(meetings)) };
            return { exitCode: 0, stdout: bounded(meetings.length === 0 ? "No meetings on the calendar that day." : meetings.map(formatMeeting).join("\n")) };
          }
          case "search": {
            const query = rest.join(" ").trim();
            if (query === "") return fail("Usage: bb obsidian search <query…>");
            const result = await vault.search(query, SEARCH_LIMIT);
            if (json) return { exitCode: 0, stdout: bounded(JSON.stringify(result)) };
            const lines = result.results.map((hit) => [hit.path, ...hit.matches.map((match) => `  ${match.line + 1}: ${match.text}`)].join("\n"));
            return { exitCode: 0, stdout: bounded(lines.length === 0 ? "No matches." : lines.join("\n")) };
          }
          case "path":
            return { exitCode: 0, stdout: await vault.access.vaultPath() };
          case "start":
          case "wrap": {
            const { threadId } = await daily.startRoutine(command);
            return { exitCode: 0, stdout: json ? JSON.stringify({ threadId }) : `Started ${threadId}` };
          }
        }
        return fail(USAGE);
      } catch (error) {
        return fail(errorMessage(error));
      }
    },
  });
}
