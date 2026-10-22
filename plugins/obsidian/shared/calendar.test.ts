import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "../contract.ts";
import { formatMeeting, meetingUrl, meetingsFrom, nextDateKey, parseCalendarNames, toMeeting } from "./calendar.ts";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    title: "Widget Weekly Sync",
    start: new Date(2026, 9, 16, 11, 0).toISOString(),
    end: new Date(2026, 9, 16, 11, 30).toISOString(),
    allDay: false,
    calendar: "sbrandenburg@cape.co",
    account: "Google",
    attendees: 13,
    canceled: false,
    myStatus: "accepted",
    ...overrides,
  };
}

describe("nextDateKey", () => {
  it("steps across month, year, and DST boundaries", () => {
    assert.equal(nextDateKey("2026-10-31"), "2026-11-01");
    assert.equal(nextDateKey("2026-12-31"), "2027-01-01");
    assert.equal(nextDateKey("2026-03-08"), "2026-03-09");
    assert.equal(nextDateKey("2026-11-01"), "2026-11-02");
  });
});

describe("parseCalendarNames", () => {
  it("splits, trims, and lowercases", () => {
    assert.deepEqual([...parseCalendarNames(" Work, sbrandenburg@cape.co ,,")], ["work", "sbrandenburg@cape.co"]);
    assert.equal(parseCalendarNames("  ").size, 0);
  });
});

describe("meetingUrl", () => {
  it("prefers the URL, then the location, then the notes", () => {
    assert.equal(meetingUrl({ url: "https://meet.google.com/abc-defg-hij", location: "https://zoom.us/j/1" }), "https://meet.google.com/abc-defg-hij");
    assert.equal(meetingUrl({ location: "Room 4, https://acme.zoom.us/j/123?pwd=x" }), "https://acme.zoom.us/j/123?pwd=x");
    assert.equal(meetingUrl({ notes: "Join: <https://meet.google.com/abc-defg-hij>\nAgenda" }), "https://meet.google.com/abc-defg-hij");
  });

  it("ignores links that aren't video calls", () => {
    assert.equal(meetingUrl({ url: "https://docs.google.com/doc", notes: "see https://example.com/x" }), null);
  });
});

describe("meetingsFrom", () => {
  const events = [
    event({ title: "Later", start: new Date(2026, 9, 16, 14, 0).toISOString() }),
    event({ title: "Holiday", allDay: true, attendees: 0, myStatus: undefined }),
    event({ title: "Declined", myStatus: "declined" }),
    event({ title: "Canceled", canceled: true }),
    event({ title: "Earlier", start: new Date(2026, 9, 16, 9, 30).toISOString() }),
    event({ title: "Personal", calendar: "Home", account: "iCloud" }),
  ];

  it("drops all-day, declined, and canceled events and sorts by start", () => {
    const titles = meetingsFrom(events, { calendars: new Set(), all: false }).map((meeting) => meeting.title);
    assert.deepEqual(titles, ["Earlier", "Personal", "Later"]);
  });

  it("keeps everything with all", () => {
    assert.equal(meetingsFrom(events, { calendars: new Set(), all: true }).length, events.length);
  });

  it("limits to the configured calendars, case-insensitively", () => {
    const titles = meetingsFrom(events, { calendars: new Set(["home"]), all: false }).map((meeting) => meeting.title);
    assert.deepEqual(titles, ["Personal"]);
  });
});

describe("toMeeting", () => {
  it("collapses notes and caps their length", () => {
    const meeting = toMeeting(event({ title: "  ", notes: `Agenda\n\n- one\n${"x".repeat(600)}` }));
    assert.equal(meeting.title, "(no title)");
    assert.ok(meeting.notes?.startsWith("Agenda - one x"));
    assert.ok(meeting.notes!.length <= 501);
  });

  it("turns HTML descriptions into plain text", () => {
    const meeting = toMeeting(event({ notes: "Review the <b>design</b><br><br>Q&amp;A after.<ul><li>one</li><li>two</li></ul>" }));
    assert.equal(meeting.notes, "Review the design Q&A after. one two");
  });

  it("drops Google's join block but still finds its call link", () => {
    const rule = "-::~:~::~:~:~:~:~:~::~:~::-";
    const meeting = toMeeting(event({ notes: `Agenda first\n\n${rule}\nJoin with Google Meet: https://meet.google.com/qrs-tuvw-xyz\nOr dial: (US) +1 555-010-0199\n${rule}` }));
    assert.equal(meeting.notes, "Agenda first");
    assert.equal(meeting.meetingUrl, "https://meet.google.com/qrs-tuvw-xyz");
    assert.equal(toMeeting(event({ notes: `${rule}\nJoin: https://meet.google.com/x\n${rule}` })).notes, null);
  });
});

describe("formatMeeting", () => {
  it("shows the time, people, a non-accepted response, and the call link", () => {
    assert.equal(formatMeeting(toMeeting(event())), "- 11:00–11:30 Widget Weekly Sync (13 people)");
    assert.equal(
      formatMeeting(toMeeting(event({ myStatus: "tentative", notes: "https://meet.google.com/abc-defg-hij" }))),
      "- 11:00–11:30 Widget Weekly Sync (13 people, tentative) https://meet.google.com/abc-defg-hij",
    );
    assert.equal(formatMeeting(toMeeting(event({ title: "DNB", attendees: 0, myStatus: undefined }))), "- 11:00–11:30 DNB");
    assert.equal(formatMeeting(toMeeting(event({ allDay: true, canceled: true, attendees: 1 }))), "- all day Widget Weekly Sync (1 person, canceled)");
  });
});

describe("week helpers", () => {
  it("find Monday and the week's days across a month boundary", async () => {
    const { addDays, weekDays, weekStart } = await import("./calendar.ts");
    assert.equal(weekStart("2026-10-22"), "2026-10-19");
    assert.equal(weekStart("2026-10-19"), "2026-10-19");
    assert.equal(weekStart("2026-10-25"), "2026-10-19");
    assert.equal(addDays("2026-10-31", 1), "2026-11-01");
    assert.equal(addDays("2026-11-01", -1), "2026-10-31");
    assert.deepEqual(weekDays("2026-11-01"), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  });
});
