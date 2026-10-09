import { expect, test } from "vitest";
import { optionsFromSettings, SCOPE_ALL, SCOPE_COMPOSER, settingDescriptors } from "../src/settings";
import { DEFAULT_OPTIONS } from "../src/vim/options";

test("missing or mistyped settings fall back to the defaults", () => {
  expect(optionsFromSettings(undefined)).toEqual(DEFAULT_OPTIONS);
  expect(optionsFromSettings({})).toEqual(DEFAULT_OPTIONS);
  expect(
    optionsFromSettings({ enabled: "no", startInInsertMode: 0, scope: 3 }),
  ).toEqual(DEFAULT_OPTIONS);
});

test("settings map onto options", () => {
  expect(
    optionsFromSettings({
      enabled: false,
      scope: SCOPE_COMPOSER,
      startInInsertMode: false,
    }),
  ).toEqual({ enabled: false, scope: "composer", startInInsertMode: false });
  expect(optionsFromSettings({ scope: SCOPE_ALL }).scope).toBe("all");
});

test("setting defaults agree with the option defaults", () => {
  const defaults = Object.fromEntries(
    Object.entries(settingDescriptors).map(([key, descriptor]) => [key, descriptor.default]),
  );
  expect(optionsFromSettings(defaults)).toEqual(DEFAULT_OPTIONS);
});
