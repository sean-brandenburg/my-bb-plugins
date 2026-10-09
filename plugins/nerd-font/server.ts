import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { settingDescriptors } from "./settings";

// The choice is applied in the app window; the server only owns the setting.
export default async function plugin(bb: BbPluginApi) {
  bb.settings.define(settingDescriptors);
}
