import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function relativeTime(epochMs: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - epochMs) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function shortSha(sha: string | null): string {
  return sha === null ? "?" : sha.slice(0, 7);
}

/** Splits "Fix thing #infra #urgent" into a title and tags. */
export function parseQuickAdd(text: string): { title: string; tags: string[] } {
  const tags: string[] = [];
  const title = text
    .replace(/(^|\s)#([a-z0-9][a-z0-9._-]*)/giu, (_match, _space: string, tag: string) => {
      tags.push(tag.toLowerCase());
      return " ";
    })
    .replace(/\s+/gu, " ")
    .trim();
  return { title, tags: [...new Set(tags)] };
}

export function threadStatusText(thread: PluginSidebarThread | null | undefined): string {
  if (thread === undefined) return "thread";
  if (thread === null) return "no thread";
  if (thread.hasPendingInteraction) return "needs you";
  if (thread.isArchived) return "archived";
  switch (thread.runtimeStatus) {
    case "active":
    case "starting":
      return "working";
    case "error":
      return "error";
    case "provisioning":
    case "waiting-for-host":
      return "provisioning";
    default:
      return "idle";
  }
}

/** A lowercase, dash-separated id from a display name, at most 40 characters; `fallback` when nothing is left. */
export function slugify(name: string, fallback: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 40) || fallback
  );
}

/** Tags typed as a list, comma or space separated, with or without the leading `#`. */
export function parseTagList(text: string): string[] {
  return parseQuickAdd(text.split(/[\s,]+/u).filter(Boolean).map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ")).tags;
}
