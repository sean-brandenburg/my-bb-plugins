import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Meeting } from "./calendar.ts";
import { matchRule, noteTarget, parseAttendeeRange, parseMeetingRules, renderPlaceholders, sanitizeNoteName, starterRulesNote } from "./meeting-rules.ts";

const DEFAULTS = { folder: "Meetings", template: "Templates/Template - Meeting Note.md" };

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    title: "Roundtable for: Jordan Rivera - Senior Backend Engineer",
    start: new Date(2026, 9, 22, 13, 0).toISOString(),
    end: new Date(2026, 9, 22, 13, 30).toISOString(),
    calendar: "me@acme.example",
    attendees: 10,
    myStatus: "accepted",
    organizer: "Recruiting",
    location: "See attached Google Meet link",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    notes: "View interview briefing at: https://app.ashbyhq.com/interview-briefings/0000",
    allDay: false,
    declined: false,
    canceled: false,
    ...overrides,
  };
}

const RULES_NOTE = `# Rules

Some prose above the rules.

\`\`\`yaml
- name: Interviews
  organizer: recruiting
  extract:
    candidate: "(?:for|with):?\\\\s*([^-]+?)\\\\s*(?:-|$)"
  folder: Interviews/
  file: "{{date}} {{candidate|title}}"
  template: Templates/Interview.md
- name: Book club
  title: "book club\\\\W*\\\\((?<book>[^)]+)\\\\)"
  folder: Reading
  file: "{{book}} {{date}}"
- name: Big
  attendees: 20+
  text: ashbyhq
  folder: Never
- name: One-on-ones
  attendees: 2
  folder: Meetings/1-1s
\`\`\`
`;

describe("parseMeetingRules", () => {
  it("reads the first yaml block and appends the catch-all", () => {
    const { rules, errors } = parseMeetingRules(RULES_NOTE, DEFAULTS);
    assert.deepEqual(errors, []);
    assert.deepEqual(
      rules.map((rule) => rule.name),
      ["Interviews", "Book club", "Big", "One-on-ones", "Meetings"],
    );
    assert.equal(rules[0]!.folder, "Interviews");
    assert.equal(rules[0]!.template, "Templates/Interview.md");
    assert.equal(rules[1]!.template, DEFAULTS.template, "a rule without a template uses the default one");
    assert.equal(rules[4]!.folder, "Meetings");
  });

  it("takes bare YAML without a fence, and a mapping with a rules list", () => {
    assert.equal(parseMeetingRules("- name: A\n  folder: X\n", DEFAULTS).rules[0]!.folder, "X");
    assert.equal(parseMeetingRules("rules:\n  - name: A\n    folder: X\n", DEFAULTS).rules[0]!.folder, "X");
  });

  it("falls back to the catch-all alone when there is no note or no rules", () => {
    assert.equal(parseMeetingRules(null, DEFAULTS).rules.length, 1);
    assert.equal(parseMeetingRules("# Nothing here\n", DEFAULTS).rules.length, 1);
  });

  it("reports entries it can't read and keeps the rest", () => {
    const { rules, errors } = parseMeetingRules("- name: Bad\n  attendees: lots\n- name: Good\n  folder: G\n", DEFAULTS);
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /Bad.*attendees/);
    assert.deepEqual(
      rules.map((rule) => rule.name),
      ["Good", "Meetings"],
    );
    assert.match(parseMeetingRules("```yaml\n- [unclosed\n```\n", DEFAULTS).errors[0]!, /valid YAML/);
  });

  it("parses the starter note it offers", () => {
    const { rules, errors } = parseMeetingRules(starterRulesNote(DEFAULTS), DEFAULTS);
    assert.deepEqual(errors, []);
    assert.equal(rules[0]!.name, "Interviews");
    assert.equal(noteTarget(rules, meeting(), "2026-10-22").path, "Interviews/2026-10-22 Jordan Rivera.md");
  });
});

describe("parseAttendeeRange", () => {
  it("reads 3+, 2-5, 0 and numbers", () => {
    assert.deepEqual(parseAttendeeRange("3+"), { min: 3, max: Number.POSITIVE_INFINITY });
    assert.deepEqual(parseAttendeeRange("2 - 5"), { min: 2, max: 5 });
    assert.deepEqual(parseAttendeeRange("0"), { min: 0, max: 0 });
    assert.deepEqual(parseAttendeeRange(4), { min: 4, max: 4 });
    assert.equal(parseAttendeeRange("lots"), null);
  });
});

describe("matchRule and noteTarget", () => {
  const { rules } = parseMeetingRules(RULES_NOTE, DEFAULTS);

  it("needs every condition, matching case-insensitively", () => {
    assert.deepEqual(matchRule(rules[0]!, meeting()), { candidate: "Jordan Rivera" });
    assert.equal(matchRule(rules[0]!, meeting({ organizer: "alex@acme.example" })), null);
    assert.equal(matchRule(rules[2]!, meeting()), null, "10 attendees isn't 20+");
    assert.equal(matchRule(rules[2]!, meeting({ attendees: 25 })) !== null, true);
    assert.equal(matchRule(rules[2]!, meeting({ attendees: 25, notes: null })), null, "text searches the description too");
  });

  it("names the note from captures, dropping characters a note can't have", () => {
    const { fields, ...target } = noteTarget(rules, meeting(), "2026-10-22");
    assert.deepEqual(target, { path: "Interviews/2026-10-22 Jordan Rivera.md", rule: "Interviews", template: "Templates/Interview.md" });
    assert.equal(fields.candidate, "Jordan Rivera");
    assert.equal(fields.time, "13:00");
    const book = meeting({ title: "📕 Book Club! (Project Hail Mary)", organizer: "sam@acme.example", attendees: 37, notes: null });
    assert.equal(noteTarget(rules, book, "2026-10-22").path, "Reading/Project Hail Mary 2026-10-22.md");
    const sim = meeting({ title: "Roadmap: Discussion?", organizer: "alex@acme.example", attendees: 4, notes: null });
    const { fields: _, ...simTarget } = noteTarget(rules, sim, "2026-10-22");
    assert.deepEqual(simTarget, { path: "Meetings/2026-10-22 Roadmap Discussion.md", rule: "Meetings", template: DEFAULTS.template });
  });

  it("falls back to the title when a capture is empty, and to the date when everything is", () => {
    const { rules: nameless } = parseMeetingRules('- file: "{{candidate}}"\n  folder: X\n', DEFAULTS);
    assert.equal(noteTarget(nameless, meeting({ title: "Sync" }), "2026-10-22").path, "X/2026-10-22 Sync.md");
    assert.equal(noteTarget(nameless, meeting({ title: "???" }), "2026-10-22").path, "X/2026-10-22.md");
  });
});

describe("renderPlaceholders", () => {
  const fields = { title: "Sync", date: "2026-10-22", time: "13:00", candidate: "", url: "https://meet.google.com/x" };

  it("fills known names, honours fallbacks and formats, and leaves unknown ones alone", () => {
    assert.equal(renderPlaceholders("# {{ title }} on {{date:YYYY-MM-DD}} at {{time}}", fields), "# Sync on 2026-10-22 at 13:00");
    assert.equal(renderPlaceholders("{{candidate|title}}", fields), "Sync");
    assert.equal(renderPlaceholders("{{candidate}}", fields), "");
    assert.equal(renderPlaceholders("{{nothing|candidate}}", fields), "");
    assert.equal(renderPlaceholders("<% tp.date.now() %> {{unknown}}", fields), "<% tp.date.now() %> {{unknown}}");
  });
});

describe("sanitizeNoteName", () => {
  it("drops Obsidian's forbidden characters and tidies whitespace", () => {
    assert.equal(sanitizeNoteName('  Roundtable for: Jordan / "Lead" #1 [x]...'), "Roundtable for Jordan Lead 1 x");
    assert.equal(sanitizeNoteName("Alex/Sam | Acme Widgets/Roadmap"), "Alex Sam Acme Widgets Roadmap");
    assert.equal(sanitizeNoteName("::"), "");
  });
});
