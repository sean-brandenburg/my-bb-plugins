import { describe, expect, it } from "vitest";
import { doneColumnId, todoColumnId } from "../shared/columns";
import { dueStatus, localDay, parseQuickAdd, parseTagList, relativeTime, slugify } from "./format";

describe("parseQuickAdd", () => {
  it("pulls #tags out of a title, lowercased and deduplicated", () => {
    expect(parseQuickAdd("Fix  login #Infra bug #urgent #infra")).toEqual({ title: "Fix login bug", tags: ["infra", "urgent"] });
    expect(parseQuickAdd("Issue#12 stays in the title")).toEqual({ title: "Issue#12 stays in the title", tags: [] });
  });
});

describe("parseTagList", () => {
  it("accepts comma or space separated tags with or without #, and drops invalid ones", () => {
    expect(parseTagList("infra, #urgent  ops,,")).toEqual(["infra", "urgent", "ops"]);
    expect(parseTagList("-bad #also_ok")).toEqual(["also_ok"]);
    expect(parseTagList("")).toEqual([]);
  });
});

describe("slugify", () => {
  it("turns a name into a lowercase dashed id of at most 40 characters, or the fallback", () => {
    expect(slugify("  In Review! ", "untitled")).toBe("in-review");
    expect(slugify("x".repeat(50), "untitled")).toHaveLength(40);
    expect(slugify("!!!", "fallback-id")).toBe("fallback-id");
  });
});

describe("relativeTime", () => {
  it("rounds to the coarsest unit that reads naturally", () => {
    const now = 1_000_000_000_000;
    expect(relativeTime(now - 30_000, now)).toBe("just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe("3 d ago");
    expect(relativeTime(now + 60_000, now)).toBe("just now");
  });
});

describe("column lookups", () => {
  it("prefer the done and todo ids, else the last and first columns, else nothing", () => {
    const columns = [{ id: "ideas" }, { id: "todo" }, { id: "done" }, { id: "archive" }];
    expect(doneColumnId(columns)).toBe("done");
    expect(todoColumnId(columns)).toBe("todo");
    expect(doneColumnId([{ id: "a" }, { id: "b" }])).toBe("b");
    expect(todoColumnId([{ id: "a" }, { id: "b" }])).toBe("a");
    expect(doneColumnId([])).toBeNull();
    expect(todoColumnId([])).toBeNull();
  });
});

describe("dueStatus", () => {
  it("names nearby days, flags overdue and imminent dates, and shows the year only when it differs", () => {
    expect(dueStatus("2026-10-08", "2026-10-08")).toMatchObject({ label: "Today", tone: "soon" });
    expect(dueStatus("2026-10-09", "2026-10-08")).toMatchObject({ label: "Tomorrow", tone: "soon" });
    expect(dueStatus("2026-10-07", "2026-10-08")).toMatchObject({ label: "Yesterday", tone: "overdue" });
    expect(dueStatus("2026-10-01", "2026-10-08").title).toContain("7 days overdue");
    expect(dueStatus("2026-10-20", "2026-10-08")).toMatchObject({ tone: "later" });
    expect(dueStatus("2026-10-20", "2026-10-08").title).toContain("in 12 days");
    expect(dueStatus("2027-01-05", "2026-10-08").label).toContain("2027");
    expect(dueStatus("2026-10-20", "2026-10-08").label).not.toContain("2026");
  });

  it("counts calendar days across a daylight saving change", () => {
    expect(dueStatus("2026-11-02", "2026-10-31").title).toContain("in 2 days");
  });
});

describe("localDay", () => {
  it("formats the local calendar day", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59).getTime())).toBe("2026-01-05");
  });
});
