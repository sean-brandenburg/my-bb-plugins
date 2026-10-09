import type { JiraIssue } from "../shared/board";
import type { KanbanSettings } from "./settings";
import { USER_AGENT } from "./util";

export interface JiraConfig {
  site: string;
  authorization: string;
}

export interface JiraSearchIssue {
  key: string;
  fields: {
    summary: string;
    description?: unknown;
    updated: string;
    status: { name: string; statusCategory?: { key?: string } };
    issuetype?: { name?: string };
    priority?: { name?: string } | null;
    assignee?: { displayName?: string; emailAddress?: string } | null;
  };
}

/** Atlassian Document Format → plain text, enough for a card description. */
export function adfToText(node: unknown): string {
  if (node === null || typeof node !== "object") return "";
  const { type, text, content } = node as { type?: string; text?: string; content?: unknown[] };
  if (type === "text") return text ?? "";
  if (type === "hardBreak") return "\n";
  const inner = Array.isArray(content) ? content.map(adfToText).join("") : "";
  switch (type) {
    case "paragraph":
    case "heading":
      return `${inner}\n\n`;
    case "listItem":
      return `- ${inner.trim()}\n`;
    case "codeBlock":
      return `\n\`\`\`\n${inner}\n\`\`\`\n`;
    default:
      return inner;
  }
}

export function jiraCategory(key: string | undefined): JiraIssue["statusCategory"] {
  return key === "new" || key === "indeterminate" || key === "done" ? key : "undefined";
}

export async function jiraConfig(settings: KanbanSettings): Promise<JiraConfig | null> {
  const { jiraSiteUrl, jiraEmail, jiraApiToken } = await settings.get();
  const site = jiraSiteUrl.trim().replace(/\/+$/u, "");
  if (site === "" || jiraEmail.trim() === "" || typeof jiraApiToken !== "string" || jiraApiToken.trim() === "") {
    return null;
  }
  return {
    site,
    authorization: `Basic ${Buffer.from(`${jiraEmail.trim()}:${jiraApiToken.trim()}`).toString("base64")}`,
  };
}

export async function jira<T>(config: JiraConfig, path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${config.site}${path}`, {
    headers: { authorization: config.authorization, accept: "application/json", "user-agent": USER_AGENT },
    signal: signal ?? null,
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(`Jira ${response.status} for ${path}: ${body}`);
  }
  return (await response.json()) as T;
}

export const JIRA_FIELDS = "summary,description,status,issuetype,priority,assignee,updated";

export function toJiraIssue(site: string, issue: JiraSearchIssue): JiraIssue {
  return {
    key: issue.key,
    url: `${site}/browse/${issue.key}`,
    status: issue.fields.status?.name ?? "",
    statusCategory: jiraCategory(issue.fields.status?.statusCategory?.key),
    issueType: issue.fields.issuetype?.name ?? "",
    priority: issue.fields.priority?.name ?? null,
    assignee: issue.fields.assignee?.displayName ?? issue.fields.assignee?.emailAddress ?? null,
    updatedAt: issue.fields.updated,
  };
}

export async function searchJira(
  config: JiraConfig,
  jql: string,
  signal?: AbortSignal,
): Promise<JiraSearchIssue[]> {
  const issues: JiraSearchIssue[] = [];
  let nextPageToken: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ jql, fields: JIRA_FIELDS, maxResults: "100" });
    if (nextPageToken !== undefined) query.set("nextPageToken", nextPageToken);
    const result = await jira<{ issues: JiraSearchIssue[]; nextPageToken?: string; isLast?: boolean }>(
      config,
      `/rest/api/3/search/jql?${query.toString()}`,
      signal,
    );
    issues.push(...result.issues);
    if (result.isLast !== false || result.nextPageToken === undefined) break;
    nextPageToken = result.nextPageToken;
  }
  return issues;
}
