// Auth profiles: a shell command prints a token, which is cached until it
// expires and sent as one request header.
import type { Launch, MetadataEntry } from "../contract.ts";
import { renderTemplate, type Endpoint, type Profile } from "../shared/config.ts";
import { runShell, type ShellResult } from "./process.ts";

const DEFAULT_TOKEN_TTL_SECONDS = 300;
const MIN_TOKEN_TTL_SECONDS = 5;
const JWT_EXPIRY_MARGIN_SECONDS = 30;

/** Seconds until a JWT (optionally "Bearer "-prefixed) expires, or null when the value is not one. */
export function jwtSecondsRemaining(value: string, nowMs: number): number | null {
  const token = value.replace(/^bearer\s+/i, "").trim();
  const parts = token.split(".");
  if (parts.length !== 3 || parts[1] === undefined) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp - nowMs / 1000 : null;
  } catch {
    return null;
  }
}

function isExpired(value: string, nowMs: number): boolean {
  const remaining = jwtSecondsRemaining(value, nowMs);
  return remaining !== null && remaining <= JWT_EXPIRY_MARGIN_SECONDS;
}

/** Fixed lifetime when configured, capped by the JWT's own expiry when the value is one. */
export function tokenTtlSeconds(profile: Profile, output: string, nowMs: number): number {
  const remaining = jwtSecondsRemaining(output, nowMs);
  const jwtTtl = remaining === null ? Number.POSITIVE_INFINITY : remaining - JWT_EXPIRY_MARGIN_SECONDS;
  const ttl = Math.min(profile.refreshSeconds ?? (remaining === null ? DEFAULT_TOKEN_TTL_SECONDS : Number.POSITIVE_INFINITY), jwtTtl);
  return Math.max(MIN_TOKEN_TTL_SECONDS, ttl);
}

export type ProfileValue = (name: string, profile: Profile, endpoint: Endpoint) => Promise<string>;

/** Header values per profile and endpoint, fetched once at a time and kept until they expire. */
export function createTokenCache(runCommand: (command: string) => Promise<ShellResult>, now: () => number = Date.now) {
  const tokens = new Map<string, { profile: string; value: string; expiresAt: number }>();
  const requests = new Map<string, Promise<string>>();

  async function fetchValue(name: string, command: string, refresh: string | undefined): Promise<string> {
    let result = await runCommand(command);
    if (refresh !== undefined && (!result.ok || isExpired(result.value, now()))) {
      const refreshed = await runCommand(refresh);
      if (!refreshed.ok) throw new Error(`Auth profile "${name}": refresh failed: ${refreshed.error}`);
      result = await runCommand(command);
    }
    if (!result.ok) throw new Error(`Auth profile "${name}": ${result.error}`);
    return result.value;
  }

  const value: ProfileValue = async (name, profile, endpoint) => {
    const command = renderTemplate(profile.command, endpoint, profile);
    const refresh = profile.refreshCommand === undefined ? undefined : renderTemplate(profile.refreshCommand, endpoint, profile);
    const key = JSON.stringify([name, profile.header, profile.prefix, command, refresh ?? null]);
    const cached = tokens.get(key);
    if (cached !== undefined && cached.expiresAt > now()) return cached.value;
    const inflight = requests.get(key);
    if (inflight !== undefined) return inflight;

    const request = fetchValue(name, command, refresh).then((output) => {
      const headerValue = profile.prefix + output;
      tokens.set(key, { profile: name, value: headerValue, expiresAt: now() + tokenTtlSeconds(profile, output, now()) * 1000 });
      return headerValue;
    });
    requests.set(key, request);
    try {
      return await request;
    } finally {
      if (requests.get(key) === request) requests.delete(key);
    }
  };

  return {
    value,
    /** Drops a profile's cached values, e.g. after the server rejected one. */
    forget(name: string): void {
      for (const [key, entry] of tokens) if (entry.profile === name) tokens.delete(key);
    },
    /** Drops every cached and in-flight value; returns how many there were. */
    reset(): number {
      const cleared = tokens.size + requests.size;
      tokens.clear();
      requests.clear();
      return cleared;
    },
  };
}

export const tokenCache = createTokenCache(runShell);

export interface ResolvedHeaders {
  entries: [string, string][];
  /** Header names whose values come from config or auth and are masked in results. */
  masked: Set<string>;
}

/**
 * Endpoint headers, then the auth profile's header, then per-call metadata, later
 * entries winning. Without an explicit profile the endpoint's own `auth` applies.
 */
export async function requestHeaders(
  launch: Launch,
  authProfile: string | null,
  metadata: MetadataEntry[],
  profileValue: ProfileValue = tokenCache.value,
): Promise<ResolvedHeaders> {
  const merged = new Map<string, string>();
  const masked = new Set<string>();
  for (const [name, value] of Object.entries(launch.endpoint.headers)) {
    merged.set(name, value);
    masked.add(name);
  }
  const overridden = new Set(metadata.map(({ name }) => name));
  const profileName = authProfile ?? (launch.endpoint.auth !== undefined && launch.endpoint.auth !== "none" ? launch.endpoint.auth : null);
  if (profileName !== null) {
    const profile = launch.auth.profiles[profileName];
    if (profile === undefined) throw new Error(`Unknown auth profile "${profileName}"`);
    if (!overridden.has(profile.header)) {
      merged.set(profile.header, await profileValue(profileName, profile, launch.endpoint));
      masked.add(profile.header);
    }
  }
  for (const { name, value } of metadata) {
    merged.set(name, value);
    masked.delete(name);
  }
  return { entries: [...merged.entries()], masked };
}
