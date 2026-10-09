import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { REPORT_LEVELS, REPORT_MAX_LENGTH } from "./src/report";
import { settingDescriptors } from "./src/settings";

export const rpcContract = defineRpcContract({
  // The app reports attach decisions and errors here so they land in
  // `bb plugin logs vim-mode`, where they can be read without devtools.
  report: {
    input: z.object({
      level: z.enum(REPORT_LEVELS),
      message: z.string().max(REPORT_MAX_LENGTH),
    }),
    output: z.null(),
  },
});

// Vim mode runs entirely in the app; the server owns settings and the log.
export default async function plugin(bb: BbPluginApi) {
  bb.settings.define(settingDescriptors);
  bb.rpc.register(rpcContract, {
    report: async ({ level, message }) => {
      bb.log[level](message);
      return null;
    },
  });
}
