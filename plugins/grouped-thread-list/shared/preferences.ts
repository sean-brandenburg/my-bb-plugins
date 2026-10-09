import { z } from "zod";

const STRING_MAX_LENGTH = 1_024;

const listItemSchema = z.string().min(1).max(STRING_MAX_LENGTH);

function definePreference<Schema extends z.ZodTypeAny>(
  schema: Schema,
  defaultValue: z.infer<Schema>,
  description: string,
) {
  return { schema, defaultValue, description };
}

export const preferenceDefinitions = {
  activeProject: definePreference(
    listItemSchema.nullable(),
    null,
    "Project id the picker starts on and new threads default to. null follows the most recently active project. Opening a thread in another project switches to it.",
  ),
} as const;

export type PreferenceKey = keyof typeof preferenceDefinitions;
export const PREFERENCE_KEYS = Object.keys(
  preferenceDefinitions,
) as PreferenceKey[];

export type PreferenceValue<Key extends PreferenceKey> = z.infer<
  (typeof preferenceDefinitions)[Key]["schema"]
>;
export type PreferenceValues = {
  [Key in PreferenceKey]: PreferenceValue<Key>;
};

export function isPreferenceKey(value: string): value is PreferenceKey {
  return Object.hasOwn(preferenceDefinitions, value);
}

export function getPreferenceDefault<Key extends PreferenceKey>(
  key: Key,
): PreferenceValue<Key> {
  return preferenceDefinitions[key].defaultValue as PreferenceValue<Key>;
}

export function defaultPreferences(): PreferenceValues {
  return Object.fromEntries(
    PREFERENCE_KEYS.map((key) => [key, getPreferenceDefault(key)]),
  ) as PreferenceValues;
}

export type PreferenceParseResult<Key extends PreferenceKey> =
  | { success: true; value: PreferenceValue<Key> }
  | { success: false; message: string };

export function parsePreferenceValue<Key extends PreferenceKey>(
  key: Key,
  value: unknown,
): PreferenceParseResult<Key> {
  const schema: z.ZodTypeAny = preferenceDefinitions[key].schema;
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return { success: true, value: parsed.data as PreferenceValue<Key> };
  }
  return {
    success: false,
    message: parsed.error.issues.map((issue) => issue.message).join("; "),
  };
}

export function parseStoredPreferenceValue<Key extends PreferenceKey>(
  key: Key,
  value: unknown,
): PreferenceParseResult<Key> {
  return parsePreferenceValue(key, value);
}

export function describePreference(key: PreferenceKey): string {
  return preferenceDefinitions[key].description;
}

export const PREFERENCES_CHANGED_CHANNEL = "preferences";

export const preferencesChangedSignalSchema = z
  .object({
    key: z.enum(PREFERENCE_KEYS as [PreferenceKey, ...PreferenceKey[]]),
    value: z.unknown(),
  })
  .strict();
