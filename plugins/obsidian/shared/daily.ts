// Daily-note conventions shared by the server (capture, routines) and the UI.
import { parse as parseYaml } from "yaml";
import type { Ticket } from "../rpc-contract.ts";
import { joinPath, noteTitle, parseFrontmatter } from "./obsidian.ts";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** YYYY-MM-DD in the machine's local time zone, matching Obsidian's daily-note names. */
export function localDateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * MS_PER_DAY);
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

export function weekdayOf(dateKey: string): string {
  return WEEKDAYS[new Date(`${dateKey}T12:00:00`).getDay()] ?? "";
}

export function dailyNotePath(folder: string, dateKey: string): string {
  return joinPath(folder.replace(/^\/+|\/+$/g, ""), `${dateKey}.md`);
}

/** The date a daily-note path is for, or null when the path isn't a daily note. */
export function dateKeyOfDailyPath(folder: string, path: string): string | null {
  const prefix = folder.replace(/^\/+|\/+$/g, "");
  const match = /^(.*\/)?(\d{4}-\d{2}-\d{2})\.md$/.exec(path);
  if (match === null) return null;
  const dir = (match[1] ?? "").replace(/\/$/, "");
  return dir === prefix && isDateKey(match[2]!) ? match[2]! : null;
}

/** A date argument as the CLI accepts it: YYYY-MM-DD, "today" (the default), "yesterday" or "tomorrow". */
export function parseDateArg(value: string | undefined, now = new Date()): string {
  if (value === undefined || value === "today") return localDateKey(now);
  if (value === "yesterday") return localDateKey(daysBefore(now, 1));
  if (value === "tomorrow") return localDateKey(daysBefore(now, -1));
  if (!isDateKey(value)) throw new Error(`Expected a date like 2026-10-06, "today", "yesterday" or "tomorrow"; got ${value}`);
  return value;
}

/** The most recent daily note dated before `dateKey`, or null. */
export function latestDailyBefore(paths: Iterable<string>, folder: string, dateKey: string): string | null {
  let best: string | null = null;
  let bestKey = "";
  for (const path of paths) {
    const key = dateKeyOfDailyPath(folder, path);
    if (key !== null && key < dateKey && (best === null || key > bestKey)) {
      best = path;
      bestKey = key;
    }
  }
  return best;
}

export const DEFAULT_DAILY_TEMPLATE = `---
date: {{date}}
tags: [daily]
tickets: []
prs: []
meetings: []
---
# {{date}} — {{weekday}}

## Inbox

## Plan

## Meetings

## Work Log

## Carry to tomorrow
`;

/** Fills Obsidian core-template style placeholders: {{date}}, {{title}}, {{weekday}}, {{time}}. */
export function renderDailyTemplate(template: string, dateKey: string, now: Date): string {
  return template
    .replace(/\{\{\s*date(?::[^}]*)?\s*\}\}/g, dateKey)
    .replace(/\{\{\s*title\s*\}\}/g, dateKey)
    .replace(/\{\{\s*weekday\s*\}\}/g, weekdayOf(dateKey))
    .replace(/\{\{\s*time(?::[^}]*)?\s*\}\}/g, localTime(now));
}

const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t#]*$/;

interface Section {
  /** Line index of the heading. */
  heading: number;
  level: number;
  /** Line index just past the section's last line. */
  end: number;
}

function findSection(lines: string[], title: string, startLine: number): Section | null {
  const wanted = title.trim().toLowerCase();
  let fence = false;
  for (let index = startLine; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const match = HEADING.exec(line);
    if (match === null || match[2]!.trim().toLowerCase() !== wanted) continue;
    const level = match[1]!.length;
    let end = lines.length;
    let innerFence = false;
    for (let next = index + 1; next < lines.length; next += 1) {
      if (/^\s*(```|~~~)/.test(lines[next]!)) innerFence = !innerFence;
      if (innerFence) continue;
      const other = HEADING.exec(lines[next]!);
      if (other !== null && other[1]!.length <= level) {
        end = next;
        break;
      }
    }
    return { heading: index, level, end };
  }
  return null;
}

function bodyStart(content: string): number {
  const frontmatter = parseFrontmatter(content);
  return frontmatter === null ? 0 : content.slice(0, frontmatter.end).split("\n").length - 1;
}

/**
 * Appends `entry` (one or more lines) to the end of the section titled
 * `heading`, creating the section at the end of the note when it's missing.
 */
export function appendToSection(content: string, heading: string, entry: string): string {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const entryLines = entry.replace(/\r\n/g, "\n").split("\n");
  const section = findSection(lines, heading, bodyStart(content));
  if (section === null) {
    while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();
    lines.push("", `## ${heading}`, ...entryLines, "");
    return lines.join(newline);
  }
  let insertAt = section.end;
  while (insertAt > section.heading + 1 && lines[insertAt - 1]!.trim() === "") insertAt -= 1;
  const needsGapAfter = section.end < lines.length && insertAt === section.end;
  // Keep a blank line between the new entry and the next heading.
  lines.splice(insertAt, 0, ...entryLines, ...(needsGapAfter ? [""] : []));
  return lines.join(newline);
}

/** The non-blank lines inside a section, or [] when it doesn't exist. */
export function sectionLines(content: string, heading: string): string[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const section = findSection(lines, heading, bodyStart(content));
  if (section === null) return [];
  return lines.slice(section.heading + 1, section.end).filter((line) => line.trim() !== "");
}

/** Unchecked `- [ ]` items in a section, with the checkbox stripped. */
export function openTasks(content: string, heading: string): string[] {
  return sectionLines(content, heading)
    .map((line) => /^\s*[-*+]\s+\[ \]\s+(.*)$/.exec(line)?.[1]?.trim())
    .filter((item): item is string => item !== undefined && item !== "");
}

/** A timestamped inbox bullet; continuation lines are indented under it. */
export function formatInboxEntry(text: string, time: string, source?: string): string {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  const suffix = source === undefined || source === "" ? "" : ` — _via ${source}_`;
  const [first = "", ...rest] = lines;
  return [`- ${time} ${first}${rest.length === 0 ? suffix : ""}`, ...rest.map((line, index) => `  ${line}${index === rest.length - 1 ? suffix : ""}`)].join("\n");
}

/** A list item for plain-text display: wikilinks become their label and **bold** markers go. */
export function plainListText(text: string): string {
  return text.replace(/\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, target: string, alias?: string) => alias ?? target).replace(/\*\*([^*]+)\*\*/g, "$1");
}

/** Top-level list items in a section, with indented continuation lines folded in. */
export function sectionItems(content: string, heading: string): string[] {
  const items: string[] = [];
  for (const line of sectionLines(content, heading)) {
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet !== null) items.push(bullet[1]!);
    else if (items.length > 0 && /^\s/.test(line)) items[items.length - 1] += `\n${line.trim()}`;
    else items.push(line.trim());
  }
  return items;
}

/** The section whose open tasks the start-of-day routine carries forward. */
export const CARRY_HEADING = "Carry to tomorrow";

/**
 * Open carry-forward tasks for today: today's own list once it has any,
 * otherwise the latest earlier daily note's.
 */
export function carryForward(
  todayPath: string,
  today: string | null,
  previousPath: string | null,
  previous: string | null,
): { path: string | null; items: string[] } {
  const todayItems = today === null ? [] : openTasks(today, CARRY_HEADING);
  if (today !== null && (todayItems.length > 0 || previous === null)) return { path: todayPath, items: todayItems };
  return { path: previousPath, items: previous === null ? [] : openTasks(previous, CARRY_HEADING) };
}

const DONE_STATUS = /^(done|closed|resolved|won't do)$/i;

/** Dashboard metadata from a ticket note's frontmatter (`jira`, `summary`, `status`, `url`). */
export function ticketFromNote(path: string, content: string | null): Ticket {
  const frontmatter = content === null ? null : parseFrontmatter(content);
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = frontmatter === null ? null : parseYaml(frontmatter.raw);
    if (parsed !== null && typeof parsed === "object") data = parsed as Record<string, unknown>;
  } catch {
    // A broken frontmatter block just means no metadata for this ticket.
  }
  const status = typeof data.status === "string" ? data.status : "";
  return {
    path,
    key: typeof data.jira === "string" ? data.jira : noteTitle(path),
    summary: typeof data.summary === "string" ? data.summary : "",
    status,
    url: typeof data.url === "string" ? data.url : null,
    done: DONE_STATUS.test(status),
  };
}

/** Open tickets first, then by key with numeric runs compared as numbers (ABC-9 before ABC-10). */
export function compareTickets(a: Ticket, b: Ticket): number {
  return Number(a.done) - Number(b.done) || a.key.localeCompare(b.key, undefined, { numeric: true });
}
