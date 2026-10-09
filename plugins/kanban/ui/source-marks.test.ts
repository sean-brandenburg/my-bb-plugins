import { describe, expect, it } from "vitest";
import { jiraStatusMark } from "./source-marks";

describe("jiraStatusMark", () => {
  it("draws the category and names the status", () => {
    expect(jiraStatusMark({ status: "To Do", statusCategory: "new" })).toMatchObject({ glyph: "issueOpened", label: "To Do" });
    expect(jiraStatusMark({ status: "In Review", statusCategory: "indeterminate" })).toMatchObject({ glyph: "progress", label: "In Review" });
    expect(jiraStatusMark({ status: "Shipped", statusCategory: "done" })).toMatchObject({ glyph: "issueClosed", label: "Shipped" });
  });

  it("leaves an empty status, or one with no category, to the text fallback", () => {
    expect(jiraStatusMark({ status: "", statusCategory: "done" })).toBeNull();
    expect(jiraStatusMark({ status: "Triage", statusCategory: "undefined" })).toBeNull();
  });
});
