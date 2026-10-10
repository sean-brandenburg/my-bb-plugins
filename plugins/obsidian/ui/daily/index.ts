// The daily-note UI's public surface. Vault components stay unaware of it; the
// composition points (app.tsx, VaultPage) plug these in.
export { CaptureInput, CaptureOverlay, captureText, openCaptureDialog, openToday, startRoutine } from "./capture";
export { DailyNoteActions } from "./DailyNoteActions";
export { Dashboard } from "./Dashboard";
