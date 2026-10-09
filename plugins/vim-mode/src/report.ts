/** The app-to-server log channel behind the `report` RPC. */

export const REPORT_LEVELS = ["info", "error"] as const;
export type ReportLevel = (typeof REPORT_LEVELS)[number];

export type Reporter = (level: ReportLevel, message: string) => void;

/** Longest message the `report` RPC accepts; the app truncates to it. */
export const REPORT_MAX_LENGTH = 4000;
