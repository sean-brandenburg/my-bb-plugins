// Rules deciding where a meeting's note goes in the vault: a YAML list in a vault note,
// matched against a calendar event, first match wins. Shared by the server (which creates
// the notes) and the calendar view (which shows where each would land).
import { parse as parseYaml } from "yaml";
import type { Meeting } from "./calendar.ts";
import { localTime, weekdayOf } from "./daily.ts";
import { INVALID_NAME_CHARS, NOTE_EXTENSION, joinPath, parseFrontmatter } from "./obsidian.ts";

export interface AttendeeRange {
  min: number;
  max: number;
}

export interface MeetingRule {
  name: string;
  /** Every condition present must hold. Regular expressions are case-insensitive. */
  title: RegExp | null;
  organizer: RegExp | null;
  calendar: RegExp | null;
  location: RegExp | null;
  /** Over the title, description, location and link together. */
  text: RegExp | null;
  attendees: AttendeeRange | null;
  allDay: boolean | null;
  /** Placeholder → regex over one of the meeting's texts; its first group (or the whole match) fills the placeholder. Not a condition. */
  extract: Record<string, Extraction>;
  folder: string;
  /** Note name pattern with placeholders, without the extension. */
  file: string;
  /** Vault path of the template note, or null for the built-in one. */
  template: string | null;
}

/** Which of a meeting's texts an extraction reads. */
export type ExtractSource = "title" | "notes" | "location" | "organizer" | "text";

export interface Extraction {
  from: ExtractSource;
  pattern: RegExp;
}

const EXTRACT_SOURCES: readonly ExtractSource[] = ["title", "notes", "location", "organizer", "text"];

/** The title, description, location and link together, which `text` conditions and extractions read. */
function allText(meeting: Meeting): string {
  return [meeting.title, meeting.notes ?? "", meeting.location ?? "", meeting.meetingUrl ?? ""].join("\n");
}

function sourceText(meeting: Meeting, source: ExtractSource): string {
  switch (source) {
    case "title":
      return meeting.title;
    case "notes":
      return meeting.notes ?? "";
    case "location":
      return meeting.location ?? "";
    case "organizer":
      return meeting.organizer ?? "";
    case "text":
      return allText(meeting);
  }
}

export interface RuleSet {
  rules: MeetingRule[];
  /** Entries that couldn't be read, in note order, so the user can fix them. */
  errors: string[];
}

export interface NoteTarget {
  path: string;
  rule: string;
  template: string | null;
  /** What the template's placeholders render to. */
  fields: Record<string, string>;
}

export const DEFAULT_FILE_PATTERN = "{{date}} {{title}}";

const MATCH_KEYS = ["title", "organizer", "calendar", "location", "text"] as const;

/** `pattern` as a case-insensitive regex; one that doesn't compile matches literally. */
export function compilePattern(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
}

/** "3+", "2-5", "0", 4 → a range; null when it isn't one. */
export function parseAttendeeRange(value: unknown): AttendeeRange | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return { min: value, max: value };
  if (typeof value !== "string") return null;
  const text = value.trim();
  let match = /^(\d+)\s*\+$/.exec(text);
  if (match !== null) return { min: Number(match[1]), max: Number.POSITIVE_INFINITY };
  match = /^(\d+)\s*-\s*(\d+)$/.exec(text);
  if (match !== null) return { min: Number(match[1]), max: Number(match[2]) };
  match = /^(\d+)$/.exec(text);
  if (match !== null) return { min: Number(match[1]), max: Number(match[1]) };
  return null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function ruleFrom(entry: unknown, index: number, defaults: { folder: string; template: string | null }): MeetingRule | string {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return `Rule ${index + 1} isn't a mapping.`;
  const data = entry as Record<string, unknown>;
  const name = stringOrNull(data.name) ?? `Rule ${index + 1}`;
  const patterns: Partial<Record<(typeof MATCH_KEYS)[number], RegExp | null>> = {};
  for (const key of MATCH_KEYS) {
    const value = data[key];
    if (value === undefined || value === null) {
      patterns[key] = null;
      continue;
    }
    if (typeof value !== "string" && typeof value !== "number") return `${name}: "${key}" must be a pattern.`;
    patterns[key] = compilePattern(String(value));
  }
  let attendees: AttendeeRange | null = null;
  if (data.attendees !== undefined && data.attendees !== null) {
    attendees = parseAttendeeRange(data.attendees);
    if (attendees === null) return `${name}: "attendees" must look like 3+, 2-5 or 0.`;
  }
  if (data.allDay !== undefined && data.allDay !== null && typeof data.allDay !== "boolean") return `${name}: "allDay" must be true or false.`;
  const extract: Record<string, Extraction> = {};
  if (data.extract !== undefined && data.extract !== null) {
    if (typeof data.extract !== "object" || Array.isArray(data.extract)) return `${name}: "extract" must map placeholder names to patterns.`;
    for (const [placeholder, spec] of Object.entries(data.extract as Record<string, unknown>)) {
      // A bare pattern reads the title; `{ from: notes, pattern: … }` reads another text.
      if (typeof spec === "string") {
        extract[placeholder] = { from: "title", pattern: compilePattern(spec) };
        continue;
      }
      if (spec === null || typeof spec !== "object" || typeof (spec as { pattern?: unknown }).pattern !== "string") return `${name}: extract.${placeholder} must be a pattern, or { from, pattern }.`;
      const from = (spec as { from?: unknown }).from ?? "title";
      if (!EXTRACT_SOURCES.includes(from as ExtractSource)) return `${name}: extract.${placeholder}.from must be one of ${EXTRACT_SOURCES.join(", ")}.`;
      extract[placeholder] = { from: from as ExtractSource, pattern: compilePattern((spec as { pattern: string }).pattern) };
    }
  }
  const template = stringOrNull(data.template);
  return {
    name,
    title: patterns.title ?? null,
    organizer: patterns.organizer ?? null,
    calendar: patterns.calendar ?? null,
    location: patterns.location ?? null,
    text: patterns.text ?? null,
    attendees,
    allDay: typeof data.allDay === "boolean" ? data.allDay : null,
    extract,
    folder: (stringOrNull(data.folder) ?? defaults.folder).replace(/^\/+|\/+$/g, ""),
    file: stringOrNull(data.file) ?? DEFAULT_FILE_PATTERN,
    template: template === null ? defaults.template : template,
  };
}

const YAML_FENCE = /^[ \t]*(```|~~~)[ \t]*ya?ml[^\n]*\n([\s\S]*?)\n[ \t]*\1[ \t]*$/m;

/** The rules' YAML: the note's first ```yaml block, else its whole body. */
function rulesYaml(content: string): string {
  const fenced = YAML_FENCE.exec(content);
  if (fenced !== null) return fenced[2]!;
  const frontmatter = parseFrontmatter(content);
  return frontmatter === null ? content : content.slice(frontmatter.end);
}

/**
 * Reads the rules note. A null note (none yet) yields no rules; the catch-all built from the
 * settings is appended either way, so every meeting lands somewhere.
 */
export function parseMeetingRules(content: string | null, defaults: { folder: string; template: string | null }): RuleSet {
  const catchAll: MeetingRule = {
    name: "Meetings",
    title: null,
    organizer: null,
    calendar: null,
    location: null,
    text: null,
    attendees: null,
    allDay: null,
    extract: {},
    folder: defaults.folder.replace(/^\/+|\/+$/g, ""),
    file: DEFAULT_FILE_PATTERN,
    template: defaults.template,
  };
  if (content === null) return { rules: [catchAll], errors: [] };
  let parsed: unknown;
  try {
    parsed = parseYaml(rulesYaml(content));
  } catch (error) {
    return { rules: [catchAll], errors: [`The rules aren't valid YAML: ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (parsed === null || parsed === undefined || (typeof parsed === "string" && parsed.trim() === "")) return { rules: [catchAll], errors: [] };
  const entries = Array.isArray(parsed) ? parsed : typeof parsed === "object" && Array.isArray((parsed as { rules?: unknown }).rules) ? (parsed as { rules: unknown[] }).rules : null;
  if (entries === null) return { rules: [catchAll], errors: ["The rules must be a YAML list (or a mapping with a `rules` list)."] };
  const rules: MeetingRule[] = [];
  const errors: string[] = [];
  entries.forEach((entry, index) => {
    const rule = ruleFrom(entry, index, defaults);
    if (typeof rule === "string") errors.push(rule);
    else rules.push(rule);
  });
  rules.push(catchAll);
  return { rules, errors };
}

/** Named groups of a match, with empty ones left out so a fallback can apply. */
function namedGroups(match: RegExpExecArray | null): Record<string, string> {
  const groups: Record<string, string> = {};
  for (const [name, value] of Object.entries(match?.groups ?? {})) {
    if (typeof value === "string" && value.trim() !== "") groups[name] = value.trim();
  }
  return groups;
}

/** Whether `rule` applies to `meeting`, and the placeholders its patterns captured. */
export function matchRule(rule: MeetingRule, meeting: Meeting): Record<string, string> | null {
  const captures: Record<string, string> = {};
  const subjects: [RegExp | null, string][] = [
    [rule.title, meeting.title],
    [rule.organizer, meeting.organizer ?? ""],
    [rule.calendar, meeting.calendar],
    [rule.location, meeting.location ?? ""],
    [rule.text, allText(meeting)],
  ];
  for (const [pattern, subject] of subjects) {
    if (pattern === null) continue;
    const match = pattern.exec(subject);
    if (match === null) return null;
    Object.assign(captures, namedGroups(match));
  }
  if (rule.attendees !== null && (meeting.attendees < rule.attendees.min || meeting.attendees > rule.attendees.max)) return null;
  if (rule.allDay !== null && meeting.allDay !== rule.allDay) return null;
  for (const [placeholder, { from, pattern }] of Object.entries(rule.extract)) {
    const match = pattern.exec(sourceText(meeting, from));
    const value = match === null ? null : (match[1] ?? match[0]);
    if (value !== null && value.trim() !== "") captures[placeholder] = value.trim();
  }
  return captures;
}

/** The first rule that matches, which is always one since the catch-all comes last. */
export function findRule(rules: readonly MeetingRule[], meeting: Meeting): { rule: MeetingRule; captures: Record<string, string> } {
  for (const rule of rules) {
    const captures = matchRule(rule, meeting);
    if (captures !== null) return { rule, captures };
  }
  const last = rules[rules.length - 1];
  if (last === undefined) throw new Error("No meeting note rules.");
  return { rule: last, captures: {} };
}

/** Everything a placeholder can name: the meeting's own fields, then the rule's captures. */
export function meetingFields(meeting: Meeting, dateKey: string, captures: Record<string, string> = {}): Record<string, string> {
  const start = new Date(meeting.start);
  const end = new Date(meeting.end);
  return {
    title: meeting.title,
    date: dateKey,
    weekday: weekdayOf(dateKey),
    time: meeting.allDay ? "" : localTime(start),
    end: meeting.allDay ? "" : localTime(end),
    organizer: meeting.organizer ?? "",
    calendar: meeting.calendar,
    attendees: String(meeting.attendees),
    url: meeting.meetingUrl ?? "",
    location: meeting.location ?? "",
    notes: meeting.notes ?? "",
    ...captures,
  };
}

const PLACEHOLDER = /\{\{\s*([^{}|]+?)(?:\s*\|\s*([^{}]+?))?\s*\}\}/g;

/**
 * Fills `{{name}}` placeholders. `{{a|b}}` uses b when a is empty or unknown; a format suffix
 * (`{{date:YYYY}}`) is ignored as in the daily template. Unknown names stay as written by
 * default, so Templater syntax in a template survives; a note name drops them instead.
 */
export function renderPlaceholders(text: string, fields: Record<string, string>, options: { unknown?: "keep" | "drop" } = {}): string {
  const lookup = (name: string): string | undefined => fields[name.replace(/:.*$/, "").trim()];
  return text.replace(PLACEHOLDER, (whole, name: string, fallbacks?: string) => {
    const names = [name, ...(fallbacks === undefined ? [] : fallbacks.split("|"))];
    let known = false;
    for (const candidate of names) {
      const value = lookup(candidate);
      if (value === undefined) continue;
      known = true;
      if (value !== "") return value;
    }
    return known || options.unknown === "drop" ? "" : whole;
  });
}

const INVALID_NAME_CHARS_ALL = new RegExp(INVALID_NAME_CHARS.source, "g");

/** A rendered name made legal for a note: separators become spaces ("Alex/Sam" → "Alex Sam"), Obsidian's other forbidden characters go, spaces are tidied. */
export function sanitizeNoteName(name: string): string {
  return name
    .replace(/[/\\|]/g, " ")
    .replace(INVALID_NAME_CHARS_ALL, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");
}

/** Where `meeting`'s note goes under `rules`. */
export function noteTarget(rules: readonly MeetingRule[], meeting: Meeting, dateKey: string): NoteTarget {
  const { rule, captures } = findRule(rules, meeting);
  const fields = meetingFields(meeting, dateKey, captures);
  const stem = sanitizeNoteName(renderPlaceholders(rule.file, fields, { unknown: "drop" })) || sanitizeNoteName(`${dateKey} ${meeting.title}`) || dateKey;
  return { path: joinPath(rule.folder, `${stem}${NOTE_EXTENSION}`), rule: rule.name, template: rule.template, fields };
}

export const DEFAULT_MEETING_TEMPLATE = `---
date: {{date}}
time: {{time}}
attendees: []
tickets: []
tags: [meeting]
---
# {{title}}

Daily note: [[{{date}}]]

## Agenda

## Notes

## Decisions

## Action items
- [ ]
`;

/** The interview template the starter rules name; written beside them when it doesn't exist. */
export const INTERVIEW_TEMPLATE_PATH = "Templates/Template - Interview Note.md";

export const DEFAULT_INTERVIEW_TEMPLATE = `---
date: {{date}}
time: {{time}}
candidate: "{{candidate|title}}"
role: "{{role}}"
tags: [meeting, interview]
---
# {{candidate|title}}

Role: {{role}}
Daily note: [[{{date}}]]
Briefing: {{briefing}}
Call: {{url}}

## Format

## Questions asked

## Signals
### For

### Concerns

## Recommendation
- [ ] Decision:

## Follow-ups
- [ ] Feedback written up
`;

/** Templates the starter rules name, for a vault that doesn't have them yet. */
export const STARTER_TEMPLATES: ReadonlyArray<{ path: string; content: string }> = [{ path: INTERVIEW_TEMPLATE_PATH, content: DEFAULT_INTERVIEW_TEMPLATE }];

/** The rules note the calendar view creates on request, as a worked example to edit. */
export function starterRulesNote(defaults: { folder: string; template: string | null }): string {
  const template = defaults.template ?? "Templates/Template - Meeting Note.md";
  return `# Meeting note rules

The Vault calendar (\`gc\`) starts a note for a meeting from the first rule below that matches it. A rule can match on \`title\`, \`organizer\`, \`calendar\`, \`location\` and \`text\` (the title, description, location and link together) with case-insensitive regular expressions, on \`attendees\` (\`3+\`, \`2-5\`, \`0\`) and on \`allDay\`. Every condition a rule names must hold. A rule with no conditions matches everything; meetings no rule matches go to \`${defaults.folder}/\`.

A match puts the note in \`folder\`, named by \`file\` and filled from \`template\`. Placeholders: \`{{title}}\`, \`{{date}}\`, \`{{time}}\`, \`{{end}}\`, \`{{weekday}}\`, \`{{organizer}}\`, \`{{calendar}}\`, \`{{attendees}}\`, \`{{url}}\`, \`{{location}}\`, \`{{notes}}\`, any named group in a condition (\`(?<candidate>…)\`), and anything under \`extract\`, which pulls a placeholder out of the title (or, as \`{ from: notes, pattern: … }\`, the description, location or organizer) without being a condition. Each rule may name its own \`template\`; the calendar reports one that doesn't exist and uses the built-in meeting template meanwhile. \`{{a|b}}\` falls back to b when a is empty. Two meetings with one title on a day share a note unless \`file\` includes \`{{time}}\`.

\`\`\`yaml
- name: Interviews
  organizer: Recruiting
  extract:
    candidate: "(?:for|with):?\\\\s*([^-]+?)\\\\s*(?:-|$)"
    role: "-\\\\s*(.+)$"
    briefing: { from: notes, pattern: "https://app\\\\.ashbyhq\\\\.com/\\\\S+" }
  folder: Interviews
  file: "{{date}} {{candidate|title}}"
  template: ${INTERVIEW_TEMPLATE_PATH}

- name: One-on-ones
  attendees: 2
  folder: Meetings/1-1s
  file: "{{date}} {{title}}"
  template: ${template}

- name: Meetings
  folder: ${defaults.folder}
  file: "{{date}} {{title}}"
  template: ${template}
\`\`\`
`;
}
