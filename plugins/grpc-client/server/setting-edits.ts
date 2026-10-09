import { PluginCliError, type PluginSettingsHandle } from "@get-bb/plugin-sdk";
import type { z } from "zod";
import type { AuthRule } from "../shared/config.ts";
import { JSON_SETTINGS, parseJsonSettingFor, type JsonSettingKey, type SETTINGS } from "./config.ts";

/**
 * A JSON setting as the user wrote it. Edits work on this rather than the parsed
 * value so schema defaults are not written back out.
 */
export type RawSetting<K extends JsonSettingKey> = z.input<(typeof JSON_SETTINGS)[K]["schema"]>;

/** Serializes read-modify-write edits of the JSON settings so concurrent CLI edits cannot overwrite each other. */
export function createSettingEditor(settings: PluginSettingsHandle<typeof SETTINGS>, pluginId: string) {
  let pending: Promise<unknown> = Promise.resolve();

  async function apply<K extends JsonSettingKey>(key: K, change: (raw: RawSetting<K>) => RawSetting<K>): Promise<void> {
    const values: Record<JsonSettingKey, string> = await settings.get();
    const raw = values[key];
    const { schema, empty } = JSON_SETTINGS[key];
    const current = parseJsonSettingFor(key, raw);
    if (!current.ok) {
      throw new PluginCliError(current.error, {
        code: "invalid_config",
        hint: `Fix it with \`bb plugin config ${pluginId} set ${key} '<json>'\` or in Settings.`,
      });
    }
    const next = change(JSON.parse(raw.trim() === "" ? empty : raw) as RawSetting<K>);
    const checked = schema.safeParse(next);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      throw new PluginCliError(`${key}${issue?.path.length ? ` at ${issue.path.join(".")}` : ""}: ${issue?.message}`, { code: "invalid_value" });
    }
    await settings.experimental_set({ [key]: JSON.stringify(next, null, 2) });
  }

  return function edit<K extends JsonSettingKey>(key: K, change: (raw: RawSetting<K>) => RawSetting<K>): Promise<void> {
    const next = pending.then(() => apply(key, change));
    pending = next.catch(() => {});
    return next;
  };
}
export type SettingEditor = ReturnType<typeof createSettingEditor>;

export function upsert<T extends { name: string }>(name: string, value: T, replace: boolean, label: string) {
  return (items: T[]): T[] => {
    const index = items.findIndex((item) => item.name === name);
    if (index === -1) return [...items, value];
    if (!replace) throw new PluginCliError(`${label} "${name}" already exists`, { code: "exists", hint: "Pass --replace to overwrite it." });
    return items.map((item, position) => (position === index ? value : item));
  };
}

export function remove<T extends { name: string }>(name: string, label: string) {
  return (items: T[]): T[] => {
    if (!items.some((item) => item.name === name)) throw new PluginCliError(`No ${label} named "${name}"`, { code: "not_found" });
    return items.filter((item) => item.name !== name);
  };
}

/** The options and field that identify a rule: at most one rule exists per key. */
export type RuleKey = Pick<AuthRule, "methodOption" | "serviceOption" | "field">;

export function sameRule(a: RuleKey, b: RuleKey): boolean {
  return a.methodOption === b.methodOption && a.serviceOption === b.serviceOption && a.field === b.field;
}
