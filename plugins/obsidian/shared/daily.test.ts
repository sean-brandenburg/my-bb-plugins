import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DAILY_TEMPLATE,
  appendToSection,
  carryForward,
  compareTickets,
  dailyNotePath,
  dateKeyOfDailyPath,
  formatInboxEntry,
  latestDailyBefore,
  localDateKey,
  openTasks,
  parseDateArg,
  plainListText,
  renderDailyTemplate,
  sectionItems,
  sectionLines,
  ticketFromNote,
} from "./daily.ts";

const note = renderDailyTemplate(DEFAULT_DAILY_TEMPLATE, "2026-10-06", new Date(2026, 9, 6, 9, 5));

describe("renderDailyTemplate", () => {
  it("fills the date and weekday", () => {
    assert.match(note, /^---\ndate: 2026-10-06\n/);
    assert.match(note, /# 2026-10-06 — Tuesday/);
  });

  it("ignores Obsidian date/time formats and fills title and time", () => {
    const rendered = renderDailyTemplate("{{date:YYYY-MM-DD}} {{ title }} {{time:HH:mm}}", "2026-10-06", new Date(2026, 9, 6, 7, 3));
    assert.equal(rendered, "2026-10-06 2026-10-06 07:03");
  });
});

describe("appendToSection", () => {
  it("appends inside the section, before the next heading", () => {
    const once = appendToSection(note, "Inbox", "- 09:05 first");
    const twice = appendToSection(once, "Inbox", "- 09:10 second");
    assert.deepEqual(sectionLines(twice, "Inbox"), ["- 09:05 first", "- 09:10 second"]);
    assert.match(twice, /- 09:10 second\n\n## Plan/);
  });

  it("creates the section when missing and keeps CRLF", () => {
    const result = appendToSection("# Day\r\n\r\nSome text\r\n", "Inbox", "- 10:00 hi");
    assert.equal(result, "# Day\r\n\r\nSome text\r\n\r\n## Inbox\r\n- 10:00 hi\r\n");
  });

  it("appends to a section at the end of the note after trailing blank lines", () => {
    assert.equal(appendToSection("# Day\n## Inbox\n- a\n\n\n", "Inbox", "- b"), "# Day\n## Inbox\n- a\n- b\n\n\n");
  });

  it("keeps subsections inside the section and stops at a sibling heading", () => {
    const content = "## Inbox\n- a\n### Later\n- c\n## Plan\n";
    assert.equal(appendToSection(content, "Inbox", "- b"), "## Inbox\n- a\n### Later\n- c\n- b\n\n## Plan\n");
  });

  it("matches the heading case-insensitively and ignores closing hashes", () => {
    const content = "## INBOX ##\n- a\n## Plan\n";
    assert.equal(appendToSection(content, "inbox", "- b\n  more"), "## INBOX ##\n- a\n- b\n  more\n\n## Plan\n");
  });

  it("appends right under an empty section heading", () => {
    assert.equal(appendToSection("## Inbox\n\n## Plan\n", "Inbox", "- a"), "## Inbox\n- a\n\n## Plan\n");
  });

  it("ignores headings inside code fences and frontmatter", () => {
    const content = "---\ntitle: Inbox\n---\n```\n## Inbox\n```\n## Inbox\n- old\n## Next\n";
    const result = appendToSection(content, "Inbox", "- new");
    assert.match(result, /```\n## Inbox\n```\n## Inbox\n- old\n- new\n\n## Next/);
  });
});

describe("openTasks", () => {
  it("lists unchecked items in a section", () => {
    const content = "## Carry to tomorrow\n- [ ] One\n- [x] Done\n  - [ ] Nested\n## Other\n- [ ] Elsewhere";
    assert.deepEqual(openTasks(content, "Carry to tomorrow"), ["One", "Nested"]);
  });
});

describe("formatInboxEntry", () => {
  it("indents continuation lines and appends the source", () => {
    assert.equal(formatInboxEntry("line one\nline two", "14:02", "bb: Fix login"), "- 14:02 line one\n  line two — _via bb: Fix login_");
  });

  it("puts the source on a single line and omits a missing one", () => {
    assert.equal(formatInboxEntry("  hi \r\n", "09:00", "cli"), "- 09:00 hi — _via cli_");
    assert.equal(formatInboxEntry("hi", "09:00"), "- 09:00 hi");
    assert.equal(formatInboxEntry("hi", "09:00", ""), "- 09:00 hi");
  });
});

describe("plainListText", () => {
  it("shows wikilinks as their alias or target and drops bold markers", () => {
    assert.equal(plainListText("met [[Ana Lopez|Ana]] about [[Projects/Plan#Goals]] **today**"), "met Ana about Projects/Plan today");
  });
});

describe("sectionItems", () => {
  it("folds continuation lines into their bullet", () => {
    const content = "## Inbox\n- 10:00 one\n  more\n- 11:00 two\n## Next";
    assert.deepEqual(sectionItems(content, "Inbox"), ["10:00 one\nmore", "11:00 two"]);
  });
});

describe("dates", () => {
  it("keys local dates and recognizes daily paths", () => {
    assert.equal(localDateKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
    assert.equal(dateKeyOfDailyPath("DailyNotes", "DailyNotes/2026-05-13.md"), "2026-05-13");
    assert.equal(dateKeyOfDailyPath("DailyNotes", "Wiki/2026-05-13.md"), null);
  });

  it("tolerates slashes around the folder and rejects nested or invalid dates", () => {
    assert.equal(dailyNotePath("/Journal/Daily/", "2026-05-13"), "Journal/Daily/2026-05-13.md");
    assert.equal(dateKeyOfDailyPath("/Journal/Daily/", "Journal/Daily/2026-05-13.md"), "2026-05-13");
    assert.equal(dateKeyOfDailyPath("Journal", "Journal/Daily/2026-05-13.md"), null);
    assert.equal(dateKeyOfDailyPath("", "2026-05-13.md"), "2026-05-13");
    assert.equal(dateKeyOfDailyPath("Journal", "Journal/2026-13-45.md"), null);
  });

  it("parses CLI date arguments", () => {
    const now = new Date(2026, 2, 1, 0, 30);
    assert.equal(parseDateArg(undefined, now), "2026-03-01");
    assert.equal(parseDateArg("today", now), "2026-03-01");
    assert.equal(parseDateArg("yesterday", now), "2026-02-28");
    assert.equal(parseDateArg("tomorrow", now), "2026-03-02");
    assert.equal(parseDateArg("2026-10-06", now), "2026-10-06");
    assert.throws(() => parseDateArg("10/06", now), /Expected a date like/);
  });

  it("finds the latest daily note before a date", () => {
    const paths = ["Daily/2026-10-01.md", "Daily/2026-10-05.md", "Daily/2026-10-06.md", "Other/2026-10-04.md", "Daily/notes.md"];
    assert.equal(latestDailyBefore(paths, "Daily", "2026-10-06"), "Daily/2026-10-05.md");
    assert.equal(latestDailyBefore(paths, "Daily", "2026-10-01"), null);
  });
});

describe("carryForward", () => {
  const withTasks = (task: string) => `## Carry to tomorrow\n- [ ] ${task}\n`;

  it("uses today's list once it has open items", () => {
    assert.deepEqual(carryForward("T.md", withTasks("today"), "P.md", withTasks("old")), { path: "T.md", items: ["today"] });
  });

  it("falls back to the previous note's list", () => {
    assert.deepEqual(carryForward("T.md", "## Carry to tomorrow\n", "P.md", withTasks("old")), { path: "P.md", items: ["old"] });
    assert.deepEqual(carryForward("T.md", null, "P.md", withTasks("old")), { path: "P.md", items: ["old"] });
  });

  it("points at today when there is no earlier note", () => {
    assert.deepEqual(carryForward("T.md", "# Day\n", null, null), { path: "T.md", items: [] });
    assert.deepEqual(carryForward("T.md", null, null, null), { path: null, items: [] });
  });
});

describe("tickets", () => {
  it("reads ticket frontmatter and falls back to the note title", () => {
    const content = "---\njira: ABC-12\nsummary: Fix login\nstatus: Won't Do\nurl: https://jira.test/ABC-12\n---\n# ABC-12\n";
    assert.deepEqual(ticketFromNote("Tickets/ABC-12.md", content), {
      path: "Tickets/ABC-12.md",
      key: "ABC-12",
      summary: "Fix login",
      status: "Won't Do",
      url: "https://jira.test/ABC-12",
      done: true,
    });
    assert.deepEqual(ticketFromNote("Tickets/Spike.md", "---\nstatus: [broken\n---\n"), {
      path: "Tickets/Spike.md",
      key: "Spike",
      summary: "",
      status: "",
      url: null,
      done: false,
    });
    assert.equal(ticketFromNote("Tickets/Gone.md", null).key, "Gone");
  });

  it("sorts open tickets first, then by key numerically", () => {
    const keys = ["ABC-10", "ABC-9", "ABC-2"].map((key) => ticketFromNote(`Tickets/${key}.md`, null));
    const closed = ticketFromNote("Tickets/ABC-1.md", "---\nstatus: Done\n---\n");
    assert.deepEqual([closed, ...keys].sort(compareTickets).map((ticket) => ticket.key), ["ABC-2", "ABC-9", "ABC-10", "ABC-1"]);
  });
});
