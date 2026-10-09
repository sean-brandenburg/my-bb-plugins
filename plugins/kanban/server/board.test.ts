import { describe, expect, it } from "vitest";
import { DEFAULT_COLUMNS, type JiraIssue, type PullRequest } from "../shared/board";
import { doneColumn, initialColumn } from "./board";

const pr = (state: PullRequest["state"]): PullRequest => ({ repo: "acme/widgets", number: 7, url: "", role: "authored", state, author: "", updatedAt: "" });
const jira = (statusCategory: JiraIssue["statusCategory"]): JiraIssue => ({ key: "PROJ-1", url: "", status: "", statusCategory, issueType: "", priority: null, assignee: null, updatedAt: "" });

describe("initialColumn", () => {
  it("puts ad hoc cards in the backlog, open PRs and new Jira issues in To Do, and finished items in Done", () => {
    expect(initialColumn(DEFAULT_COLUMNS, null)).toBe("backlog");
    expect(initialColumn(DEFAULT_COLUMNS, pr("open"))).toBe("todo");
    expect(initialColumn(DEFAULT_COLUMNS, pr("draft"))).toBe("todo");
    expect(initialColumn(DEFAULT_COLUMNS, pr("merged"))).toBe("done");
    expect(initialColumn(DEFAULT_COLUMNS, pr("closed"))).toBe("done");
    expect(initialColumn(DEFAULT_COLUMNS, null, jira("new"))).toBe("todo");
    expect(initialColumn(DEFAULT_COLUMNS, null, jira("indeterminate"))).toBe("in-progress");
    expect(initialColumn(DEFAULT_COLUMNS, null, jira("done"))).toBe("done");
  });

  it("falls back to the next preferred column, then the first, when the user removed the usual one", () => {
    const columns = [
      { id: "ideas", name: "Ideas" },
      { id: "todo", name: "To Do" },
      { id: "shipped", name: "Shipped" },
    ];
    expect(initialColumn(columns, null)).toBe("todo");
    expect(initialColumn(columns, null, jira("indeterminate"))).toBe("todo");
    expect(initialColumn(columns, pr("merged"))).toBe("ideas");
    expect(doneColumn(columns)).toBe("shipped");
  });
});
