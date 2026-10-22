// Daily notes: quick capture into today's inbox, the vault home dashboard, the
// bb thread activity log, and the agent routines (start/log/wrap). Everything
// here reaches the vault only through `VaultAccess`.
import type { BbPluginApi, PluginRpcHandlers, PluginSettingDescriptor, PluginSettingsHandle } from "@get-bb/plugin-sdk";
import type { CalendarEvents, NoteContent, VaultTree, WriteResult } from "../contract.ts";
import type { PlannedMeeting, dailyRpcContract } from "../rpc-contract.ts";
import { meetingDateKey, meetingsFrom, nextDateKey, parseCalendarNames, type Meeting } from "../shared/calendar.ts";
import { DEFAULT_MEETING_TEMPLATE, meetingFields, noteTarget, parseMeetingRules, renderPlaceholders, starterRulesNote, type RuleSet } from "../shared/meeting-rules.ts";
import {
  DEFAULT_DAILY_TEMPLATE,
  appendToSection,
  carryForward,
  compareTickets,
  dailyNotePath,
  formatInboxEntry,
  latestDailyBefore,
  localDateKey,
  localTime,
  renderDailyTemplate,
  sectionItems,
  ticketFromNote,
} from "../shared/daily.ts";
import { createResolver, isNotePath, NOTE_EXTENSION } from "../shared/obsidian.ts";
import { createActivityLog } from "./activity.ts";
import { registerVaultMentions } from "./mentions.ts";
import { createRoutines } from "./routines.ts";
import { excerpt } from "./text.ts";

/** What the daily-note features need from the vault. */
export interface VaultAccess {
  vaultPath(): Promise<string>;
  hostId(): Promise<string>;
  /** Null when the file doesn't exist. */
  read(path: string): Promise<NoteContent | null>;
  write(path: string, content: string, expectedSha256: string | null): Promise<WriteResult>;
  tree(): Promise<VaultTree>;
  /** macOS Calendar events on the vault's machine between two local dates, `to` exclusive. */
  calendarEvents(from: string, to: string): Promise<CalendarEvents>;
}

const DEFAULT_DAILY_FOLDER = "DailyNotes";
const DEFAULT_INBOX_HEADING = "Inbox";
const DEFAULT_TICKETS_FOLDER = "Tickets";
const DEFAULT_ROUTINE_PROVIDER = "claude-code";
const DEFAULT_MEETINGS_FOLDER = "Meetings";
const DEFAULT_MEETING_RULES_NOTE = "Templates/Meeting Note Rules.md";
/** The daily-note section a new meeting note is linked from. */
const MEETINGS_HEADING = "Meetings";

export const DAILY_SETTINGS = {
  dailyFolder: {
    type: "string",
    label: "Daily notes folder",
    description: "Vault folder holding YYYY-MM-DD.md daily notes.",
    default: DEFAULT_DAILY_FOLDER,
  },
  dailyTemplate: {
    type: "string",
    label: "Daily note template",
    description: "Vault note used for new daily notes. {{date}}, {{weekday}} and {{time}} are filled in.",
    default: "Templates/Daily Note.md",
  },
  inboxHeading: {
    type: "string",
    label: "Inbox heading",
    description: "Section of the daily note that quick captures are appended to.",
    default: DEFAULT_INBOX_HEADING,
  },
  ticketsFolder: {
    type: "string",
    label: "Ticket notes folder",
    default: DEFAULT_TICKETS_FOLDER,
  },
  routineProvider: {
    type: "string",
    label: "Agent for daily routines",
    description: "Provider that runs Start day / Wrap up. It must have the daily-note skill.",
    default: DEFAULT_ROUTINE_PROVIDER,
  },
  calendarNames: {
    type: "string",
    label: "Calendars for meetings",
    description: "Comma-separated macOS Calendar names to list meetings from. Blank uses every calendar.",
    default: "",
  },
  meetingRulesNote: {
    type: "string",
    label: "Meeting note rules",
    description: "Vault note holding the YAML rules that decide where the calendar puts each meeting's note. Created with an example when first opened from the calendar.",
    default: DEFAULT_MEETING_RULES_NOTE,
  },
  meetingsFolder: {
    type: "string",
    label: "Meeting notes folder",
    description: "Where a meeting note goes when no rule matches.",
    default: DEFAULT_MEETINGS_FOLDER,
  },
  meetingTemplate: {
    type: "string",
    label: "Meeting note template",
    description: "Vault note new meeting notes are filled from unless a rule names another. {{title}}, {{date}}, {{time}}, {{url}} and the other placeholders are filled in.",
    default: "Templates/Template - Meeting Note.md",
  },
  captureActivity: {
    type: "boolean",
    label: "Record bb thread activity for daily notes",
    description: "Keeps a per-day list of threads you worked on (title, project, last reply) for the wrap-up.",
    default: true,
  },
} satisfies Record<string, PluginSettingDescriptor>;

type DailySettingsHandle = PluginSettingsHandle<typeof DAILY_SETTINGS>;
type DailySettings = Awaited<ReturnType<DailySettingsHandle["get"]>>;

/** Blank text settings fall back to their defaults. */
function normalize(values: DailySettings): DailySettings {
  return {
    dailyFolder: values.dailyFolder.trim() || DEFAULT_DAILY_FOLDER,
    dailyTemplate: values.dailyTemplate.trim(),
    inboxHeading: values.inboxHeading.trim() || DEFAULT_INBOX_HEADING,
    ticketsFolder: values.ticketsFolder.trim() || DEFAULT_TICKETS_FOLDER,
    routineProvider: values.routineProvider.trim() || DEFAULT_ROUTINE_PROVIDER,
    calendarNames: values.calendarNames,
    meetingRulesNote: values.meetingRulesNote.trim() || DEFAULT_MEETING_RULES_NOTE,
    meetingsFolder: values.meetingsFolder.trim() || DEFAULT_MEETINGS_FOLDER,
    meetingTemplate: values.meetingTemplate.trim(),
    captureActivity: values.captureActivity,
  };
}

const MAX_APPEND_ATTEMPTS = 5;
const CAPTURE_LIMIT = 20_000;
const SOURCE_TITLE_LIMIT = 60;

function withMd(path: string): string {
  return isNotePath(path) ? path : `${path}${NOTE_EXTENSION}`;
}

export function createDaily(bb: BbPluginApi, vault: VaultAccess, settingsHandle: DailySettingsHandle) {
  const settings = async () => normalize(await settingsHandle.get());

  const projectNames = new Map<string, string>();
  async function projectName(projectId: string): Promise<string> {
    const cached = projectNames.get(projectId);
    if (cached !== undefined) return cached;
    const name = await bb.sdk.projects.get({ projectId }).then(
      (project) => project.name,
      () => projectId,
    );
    projectNames.set(projectId, name);
    return name;
  }

  const routines = createRoutines(bb, vault, async () => (await settings()).routineProvider);
  const activity = createActivityLog(bb, {
    async shouldRecord(thread) {
      if (!(await settings()).captureActivity || thread.originPluginId === bb.pluginId) return false;
      return !(await routines.isVaultProject(thread.projectId));
    },
    projectName,
  });

  async function dailyPath(dateKey: string): Promise<string> {
    return dailyNotePath((await settings()).dailyFolder, dateKey);
  }

  registerVaultMentions(bb, vault, () => dailyPath(localDateKey(new Date())));

  async function ensureDailyNote(dateKey: string, now = new Date()): Promise<{ path: string; note: NoteContent }> {
    const { dailyFolder, dailyTemplate } = await settings();
    const path = dailyNotePath(dailyFolder, dateKey);
    const existing = await vault.read(path);
    if (existing !== null) return { path, note: existing };
    const templateNote = dailyTemplate === "" ? null : await vault.read(withMd(dailyTemplate));
    const content = renderDailyTemplate(templateNote?.content ?? DEFAULT_DAILY_TEMPLATE, dateKey, now);
    // Create-only: if something else created it first, use that one.
    await vault.write(path, content, null);
    const created = await vault.read(path);
    if (created === null) throw new Error(`Couldn't create ${path}`);
    return { path, note: created };
  }

  /** "bb: <thread title> (<project>)", naming the thread a capture came from. */
  async function threadSource(threadId: string | undefined): Promise<string | undefined> {
    if (threadId === undefined) return undefined;
    try {
      const thread = await bb.sdk.threads.get({ threadId });
      const title = excerpt(thread.title ?? thread.titleFallback ?? threadId, SOURCE_TITLE_LIMIT);
      return `bb: ${title} (${await projectName(thread.projectId)})`;
    } catch {
      return `bb thread ${threadId}`;
    }
  }

  /** Appends a capture to today's inbox, retrying when the note changes underneath. */
  async function capture(text: string, threadId: string | undefined, now = new Date()): Promise<{ path: string }> {
    const source = await threadSource(threadId);
    const trimmed = text.trim();
    if (trimmed === "") throw new Error("Nothing to log.");
    const { inboxHeading } = await settings();
    const entry = formatInboxEntry(excerpt(trimmed, CAPTURE_LIMIT), localTime(now), source);
    let { path, note } = await ensureDailyNote(localDateKey(now), now);
    for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt += 1) {
      const next = appendToSection(note.content, inboxHeading, entry);
      const result = await vault.write(path, next, note.sha256);
      if (result.outcome === "written") return { path };
      const current = await vault.read(path);
      if (current === null) ({ path, note } = await ensureDailyNote(localDateKey(now), now));
      else note = current;
    }
    throw new Error("Today's note kept changing; try logging again.");
  }

  async function dashboard() {
    const { dailyFolder, inboxHeading, ticketsFolder } = await settings();
    const dateKey = localDateKey(new Date());
    const todayPath = dailyNotePath(dailyFolder, dateKey);
    const today = await vault.read(todayPath);
    const tree = await vault.tree();
    const previousPath = latestDailyBefore(
      tree.files.map((file) => file.path),
      dailyFolder,
      dateKey,
    );
    const previous = previousPath === null ? null : await vault.read(previousPath);
    const ticketPrefix = ticketsFolder.replace(/\/+$/, "") + "/";
    const tickets = [];
    for (const file of tree.files) {
      if (!file.path.startsWith(ticketPrefix) || !isNotePath(file.path)) continue;
      const note = await vault.read(file.path);
      tickets.push(ticketFromNote(file.path, note?.content ?? null));
    }
    return {
      dateKey,
      today: {
        path: todayPath,
        exists: today !== null,
        inbox: today === null ? [] : sectionItems(today.content, inboxHeading),
      },
      carryForward: carryForward(todayPath, today?.content ?? null, previousPath, previous?.content ?? null),
      tickets: tickets.sort(compareTickets),
      activity: activity.forDay(dateKey),
    };
  }

  /** The rules note, read fresh each time so edits apply at once. */
  async function meetingRules(): Promise<{ path: string; exists: boolean; rules: RuleSet }> {
    const { meetingRulesNote, meetingsFolder, meetingTemplate } = await settings();
    const path = withMd(meetingRulesNote);
    const note = await vault.read(path);
    const defaults = { folder: meetingsFolder, template: meetingTemplate === "" ? null : withMd(meetingTemplate) };
    return { path, exists: note !== null, rules: parseMeetingRules(note?.content ?? null, defaults) };
  }

  async function plan(meetings: Meeting[]): Promise<{ meetings: PlannedMeeting[]; rules: { path: string; exists: boolean; errors: string[] } }> {
    const { path, exists, rules } = await meetingRules();
    return {
      meetings: meetings.map((meeting) => {
        const date = meetingDateKey(meeting);
        const { fields: _fields, ...note } = noteTarget(rules.rules, meeting, date);
        return { ...meeting, date, note };
      }),
      rules: { path, exists, errors: rules.errors },
    };
  }

  /** Meetings between two local dates (`to` exclusive), with the note each would get. */
  async function meetingsBetween(from: string, to: string, all: boolean) {
    const { events } = await vault.calendarEvents(from, to);
    return plan(meetingsFrom(events, { calendars: parseCalendarNames((await settings()).calendarNames), all }));
  }

  async function meetingsFor(dateKey: string, all: boolean): Promise<PlannedMeeting[]> {
    return (await meetingsBetween(dateKey, nextDateKey(dateKey), all)).meetings;
  }

  /** Adds `- [[note]]` under the daily note's Meetings heading, unless it's already linked there. */
  async function linkFromDailyNote(dateKey: string, notePath: string): Promise<void> {
    const today = localDateKey(new Date());
    let path: string;
    let note: NoteContent | null;
    if (dateKey === today) ({ path, note } = await ensureDailyNote(dateKey));
    else {
      path = await dailyPath(dateKey);
      note = await vault.read(path);
    }
    if (note === null) return;
    const tree = await vault.tree();
    const linkText = createResolver(tree.files.map((file) => file.path)).linkTextFor(notePath);
    for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS && note !== null; attempt += 1) {
      if (note.content.includes(`[[${linkText}]]`) || note.content.includes(`[[${linkText}|`)) return;
      const result = await vault.write(path, appendToSection(note.content, MEETINGS_HEADING, `- [[${linkText}]]`), note.sha256);
      if (result.outcome === "written") return;
      note = await vault.read(path);
    }
  }

  /** The meeting's note at the path its rule gives: created from the template when new, else as it is. */
  async function startMeetingNote(meeting: Meeting): Promise<{ path: string; created: boolean }> {
    const dateKey = meetingDateKey(meeting);
    const { rules } = await meetingRules();
    const target = noteTarget(rules.rules, meeting, dateKey);
    if ((await vault.read(target.path)) !== null) return { path: target.path, created: false };
    const templateNote = target.template === null ? null : await vault.read(target.template);
    const content = renderPlaceholders(templateNote?.content ?? DEFAULT_MEETING_TEMPLATE, meetingFields(meeting, dateKey, target.fields));
    // Create-only: a note that appeared meanwhile is kept.
    const result = await vault.write(target.path, content, null);
    await linkFromDailyNote(dateKey, target.path);
    return { path: target.path, created: result.outcome === "written" };
  }

  async function ensureMeetingRules(): Promise<{ path: string; created: boolean }> {
    const { path, exists } = await meetingRules();
    if (exists) return { path, created: false };
    const { meetingsFolder, meetingTemplate } = await settings();
    const result = await vault.write(path, starterRulesNote({ folder: meetingsFolder, template: meetingTemplate === "" ? null : withMd(meetingTemplate) }), null);
    return { path, created: result.outcome === "written" };
  }

  async function status() {
    return { dailyFolder: (await settings()).dailyFolder, todayKey: localDateKey(new Date()) };
  }

  const rpcHandlers: PluginRpcHandlers<typeof dailyRpcContract> = {
    capture: ({ text, threadId }) => capture(text, threadId),
    async openToday() {
      const { path } = await ensureDailyNote(localDateKey(new Date()));
      return { path };
    },
    startRoutine: ({ mode }) => routines.start(mode),
    dashboard,
    meetings: ({ from, to }) => meetingsBetween(from, to, true),
    startMeetingNote: ({ meeting }) => startMeetingNote(meeting),
    ensureMeetingRules,
  };

  return {
    capture,
    ensureDailyNote,
    startRoutine: routines.start,
    activityFor: activity.forDay,
    meetingsFor,
    status,
    rpcHandlers,
  };
}

export type Daily = ReturnType<typeof createDaily>;
