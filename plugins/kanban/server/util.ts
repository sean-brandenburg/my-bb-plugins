import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

export const execFileAsync = promisify(execFile);

export const USER_AGENT = "bb-plugin-kanban";

const THREAD_TITLE_MAX_LENGTH = 200;

/** Ids for cards, reviews and comments: short enough to type in `bb kanban` commands. */
export function shortId(): string {
  return randomUUID().slice(0, 8);
}

export function threadTitle(title: string): string {
  return title.slice(0, THREAD_TITLE_MAX_LENGTH);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A JSON array of strings stored in a TEXT column (tags, comment ids, ticket ids); anything else reads as empty. */
export function parseStringArray(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

export function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag !== ""))].sort();
}
