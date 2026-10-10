export interface ContextUsage {
  usedTokens: number | null;
  modelContextWindow: number | null;
}

export interface RateLimitWindow {
  label: string | null;
  status: "allowed" | "blocked" | "unknown" | "warning";
  resetsAtMs: number | null;
}

export interface CatalogModel {
  id: string;
  model: string;
  displayName: string;
}

// Claude threads can carry a family alias like "opus", which Claude Code
// resolves to that family's newest model; the catalog lists newest first.
export function resolveModelName(
  catalog: readonly CatalogModel[],
  selected: string,
): string {
  const exact = catalog.find(
    (entry) => entry.id === selected || entry.model === selected,
  );
  if (exact !== undefined) return exact.displayName;
  const family = catalog.find((entry) =>
    entry.id.startsWith(`claude-${selected}-`),
  );
  return family?.displayName ?? selected;
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(Math.round(tokens));
  if (tokens < 1_000_000) {
    const thousands = tokens / 1000;
    return `${thousands < 10 ? trimDecimal(thousands) : Math.round(thousands)}k`;
  }
  return `${trimDecimal(tokens / 1_000_000)}M`;
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

export function formatContext(
  usage: ContextUsage | null,
): { used: string; window: string | null } | null {
  if (usage === null || usage.usedTokens === null) return null;
  return {
    used: formatTokens(usage.usedTokens),
    window:
      usage.modelContextWindow === null
        ? null
        : formatTokens(usage.modelContextWindow),
  };
}

export function formatReset(resetsAtMs: number, nowMs: number): string {
  const minutes = Math.max(0, Math.round((resetsAtMs - nowMs) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

// Only windows that need attention earn space in the footer, and only as an
// icon plus the time to reset; the title carries the sentence.
export function rateLimitNotice(
  windows: readonly RateLimitWindow[],
  nowMs: number,
): { text: string; title: string; blocked: boolean } | null {
  // The last event can outlive its window's reset on an idle thread.
  const live = windows.filter(
    (candidate) => candidate.resetsAtMs === null || candidate.resetsAtMs > nowMs,
  );
  const window =
    live.find((candidate) => candidate.status === "blocked") ??
    live.find((candidate) => candidate.status === "warning");
  if (window === undefined) return null;
  const blocked = window.status === "blocked";
  const label = window.label ?? "Usage limit";
  const reset =
    window.resetsAtMs === null ? null : formatReset(window.resetsAtMs, nowMs);
  return {
    text: reset ?? (blocked ? "limit reached" : "limit"),
    title: `${label} ${blocked ? "reached" : "nearly used"}${reset === null ? "" : ` · resets in ${reset}`}`,
    blocked,
  };
}
