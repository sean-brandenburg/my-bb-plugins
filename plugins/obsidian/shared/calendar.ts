// Turning macOS Calendar events into a day's meeting list for the daily note.
import type { CalendarEvent } from "../contract.ts";
import { localDateKey, localTime } from "./daily.ts";

export interface Meeting {
  title: string;
  start: string;
  end: string;
  calendar: string;
  attendees: number;
  myStatus: string | null;
  organizer: string | null;
  location: string | null;
  /** Video call link from the event's URL, location, or description. */
  meetingUrl: string | null;
  notes: string | null;
  allDay: boolean;
  declined: boolean;
  canceled: boolean;
}

const MEETING_URL = /https:\/\/(?:[\w-]+\.)*(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com|webex\.com|chime\.aws|around\.co|whereby\.com)\/[^\s<>"')\]]*/i;
/** The join/dial-in block Google Calendar wraps in "-::~:~::~…::-" rules. */
const CONFERENCE_BLOCK = /-::~[:~]*::-[\s\S]*?-::~[:~]*::-/g;
const HTML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
const NOTES_LIMIT = 500;

/** The day after a YYYY-MM-DD date, using noon so DST changes can't skip or repeat a day. */
export function nextDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return localDateKey(date);
}

/** "Work, sbrandenburg@cape.co" → a set of lowercased calendar names; empty means every calendar. */
export function parseCalendarNames(setting: string): Set<string> {
  return new Set(
    setting
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name !== ""),
  );
}

export function meetingUrl(event: Pick<CalendarEvent, "url" | "location" | "notes">): string | null {
  for (const text of [event.url, event.location, event.notes]) {
    const match = text === undefined ? null : MEETING_URL.exec(text);
    if (match !== null) return match[0];
  }
  return null;
}

function compactNotes(notes: string | undefined): string | null {
  if (notes === undefined) return null;
  // Google Calendar stores descriptions as HTML.
  const text = notes
    .replace(CONFERENCE_BLOCK, " ")
    .replace(/<br\s*\/?>|<\/?(?:p|div|ul|ol|li)\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => HTML_ENTITIES[name]!)
    .replace(/\s+/g, " ")
    .trim();
  if (text === "") return null;
  return text.length > NOTES_LIMIT ? `${text.slice(0, NOTES_LIMIT).trimEnd()}…` : text;
}

export function toMeeting(event: CalendarEvent): Meeting {
  return {
    title: event.title.trim() || "(no title)",
    start: event.start,
    end: event.end,
    calendar: event.calendar,
    attendees: event.attendees,
    myStatus: event.myStatus ?? null,
    organizer: event.organizer ?? null,
    location: event.location ?? null,
    meetingUrl: meetingUrl(event),
    notes: compactNotes(event.notes),
    allDay: event.allDay,
    declined: event.myStatus === "declined",
    canceled: event.canceled,
  };
}

/**
 * The day's meetings in start order. Unless `all` is set, drops all-day
 * entries (holidays, birthdays, OOO), declined invites, and canceled events.
 */
export function meetingsFrom(events: readonly CalendarEvent[], options: { calendars: Set<string>; all: boolean }): Meeting[] {
  return events
    .filter((event) => options.calendars.size === 0 || options.calendars.has(event.calendar.toLowerCase()))
    .map(toMeeting)
    .filter((meeting) => options.all || !(meeting.allDay || meeting.declined || meeting.canceled))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** "- 11:00–11:30 Widget Weekly (13 people, tentative) https://meet.google.com/…" */
export function formatMeeting(meeting: Meeting): string {
  const time = meeting.allDay ? "all day" : `${localTime(new Date(meeting.start))}–${localTime(new Date(meeting.end))}`;
  const details = [
    meeting.attendees > 0 ? `${meeting.attendees} ${meeting.attendees === 1 ? "person" : "people"}` : null,
    meeting.canceled ? "canceled" : meeting.myStatus !== null && meeting.myStatus !== "accepted" ? meeting.myStatus : null,
  ].filter((detail) => detail !== null);
  const suffix = details.length === 0 ? "" : ` (${details.join(", ")})`;
  return `- ${time} ${meeting.title}${suffix}${meeting.meetingUrl === null ? "" : ` ${meeting.meetingUrl}`}`;
}
