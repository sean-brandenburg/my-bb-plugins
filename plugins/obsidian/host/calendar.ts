// Reads calendar events through macOS EventKit. bb.app has no calendar usage
// description, so anything it spawns is denied calendar access without a
// prompt. Instead this builds a tiny signed helper app and starts it through
// LaunchServices (`open`), which gives it its own privacy identity and prompt.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import nodePath from "node:path";
import { promisify } from "node:util";
import type { CalendarEvents } from "../contract.ts";
import { exists, sha256 } from "./fs.ts";

const run = promisify(execFile);

const APP_NAME = "CalendarEvents";
/** Longer than the helper's own 120s wait for the permission prompt. */
const LAUNCH_TIMEOUT_MS = 140_000;
const BUILD_TIMEOUT_MS = 180_000;

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>dev.bb.obsidian.calendar-events</string>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key>
  <string>bb Calendar Reader</string>
  <key>CFBundleExecutable</key>
  <string>${APP_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSCalendarsFullAccessUsageDescription</key>
  <string>Reads your calendar events so the bb Obsidian plugin can list meetings in your daily note.</string>
  <key>NSCalendarsUsageDescription</key>
  <string>Reads your calendar events so the bb Obsidian plugin can list meetings in your daily note.</string>
</dict>
</plist>
`;

const SWIFT_SOURCE = String.raw`import EventKit
import Foundation

func argument(_ name: String) -> String? {
  let args = CommandLine.arguments
  guard let index = args.firstIndex(of: name), index + 1 < args.count else { return nil }
  return args[index + 1]
}

guard let outPath = argument("--out") else { exit(2) }

func finish(_ object: [String: Any]) -> Never {
  let data = (try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]))
    ?? Data("{\"ok\":false,\"error\":\"Couldn't encode the events\"}".utf8)
  FileManager.default.createFile(atPath: outPath, contents: data)
  exit(0)
}

func fail(_ message: String) -> Never { finish(["ok": false, "error": message]) }

let settingsHint = "allow bb Calendar Reader under System Settings → Privacy & Security → Calendars"

let dayFormat = DateFormatter()
dayFormat.locale = Locale(identifier: "en_US_POSIX")
dayFormat.dateFormat = "yyyy-MM-dd"
guard let fromText = argument("--from"), let toText = argument("--to"),
      let from = dayFormat.date(from: fromText), let to = dayFormat.date(from: toText), from < to
else { fail("Expected --from YYYY-MM-DD --to YYYY-MM-DD with from before to") }

// A permission prompt nobody answers would otherwise keep this running forever.
DispatchQueue.global().asyncAfter(deadline: .now() + 120) {
  fail("Timed out waiting for calendar access; " + settingsHint)
}

let iso = ISO8601DateFormatter()
iso.formatOptions = [.withInternetDateTime]
iso.timeZone = TimeZone.current

func participation(_ status: EKParticipantStatus) -> String {
  switch status {
  case .accepted: return "accepted"
  case .declined: return "declined"
  case .tentative: return "tentative"
  case .pending: return "pending"
  case .delegated: return "delegated"
  case .completed: return "completed"
  case .inProcess: return "in-process"
  default: return "unknown"
  }
}

let store = EKEventStore()
store.requestFullAccessToEvents { granted, error in
  guard granted else {
    fail("Calendar access denied (" + (error?.localizedDescription ?? "not allowed") + "); " + settingsHint)
  }
  let calendars = store.calendars(for: .event)
  let predicate = store.predicateForEvents(withStart: from, end: to, calendars: calendars)
  let events = store.events(matching: predicate).sorted { $0.startDate < $1.startDate }.map { event -> [String: Any] in
    var item: [String: Any] = [
      "title": event.title ?? "",
      "start": iso.string(from: event.startDate),
      "end": iso.string(from: event.endDate),
      "allDay": event.isAllDay,
      "calendar": event.calendar.title,
      "account": event.calendar.source.title,
      "attendees": event.attendees?.count ?? 0,
      "canceled": event.status == .canceled,
    ]
    if let me = event.attendees?.first(where: { $0.isCurrentUser }) { item["myStatus"] = participation(me.participantStatus) }
    if let organizer = event.organizer { item["organizer"] = organizer.name ?? organizer.url.absoluteString }
    if let location = event.location, !location.isEmpty { item["location"] = location }
    if let url = event.url { item["url"] = url.absoluteString }
    if let notes = event.notes, !notes.isEmpty { item["notes"] = String(notes.prefix(4000)) }
    return item
  }
  let calendarList = calendars.map { ["title": $0.title, "account": $0.source.title] }
  finish(["ok": true, "events": events, "calendars": calendarList])
}

dispatchMain()
`;

const SOURCE_HASH = sha256(SWIFT_SOURCE + INFO_PLIST);

let building: Promise<string> | null = null;

/**
 * The helper app's path, compiling it only when it's missing or its source
 * changed. Its privacy grant is tied to the exact binary, so a rebuild means
 * the user is asked again.
 */
function helperApp(dataDir: string, tempDir: string): Promise<string> {
  building ??= buildHelper(dataDir, tempDir).finally(() => {
    building = null;
  });
  return building;
}

async function buildHelper(dataDir: string, tempDir: string): Promise<string> {
  const dir = nodePath.join(dataDir, "calendar");
  const app = nodePath.join(dir, `${APP_NAME}.app`);
  const hashFile = nodePath.join(dir, "source.sha256");
  const builtHash = await fs.readFile(hashFile, "utf8").catch(() => null);
  if (builtHash === SOURCE_HASH && (await exists(nodePath.join(app, "Contents", "MacOS", APP_NAME)))) return app;

  const work = nodePath.join(tempDir, `calendar-build-${randomUUID()}`);
  const staged = nodePath.join(work, `${APP_NAME}.app`);
  try {
    await fs.mkdir(nodePath.join(staged, "Contents", "MacOS"), { recursive: true });
    await fs.writeFile(nodePath.join(work, "main.swift"), SWIFT_SOURCE);
    await fs.writeFile(nodePath.join(staged, "Contents", "Info.plist"), INFO_PLIST);
    try {
      await run(
        "/usr/bin/swiftc",
        ["-O", "-module-cache-path", nodePath.join(work, "module-cache"), "-o", nodePath.join(staged, "Contents", "MacOS", APP_NAME), nodePath.join(work, "main.swift")],
        { timeout: BUILD_TIMEOUT_MS },
      );
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr?.trim();
      throw new Error(`Couldn't build the calendar helper with swiftc (install the Xcode command line tools with \`xcode-select --install\`)${stderr ? `: ${stderr.slice(-1000)}` : ""}`);
    }
    await run("/usr/bin/codesign", ["--force", "--sign", "-", staged]);
    await fs.mkdir(dir, { recursive: true });
    await fs.rm(app, { recursive: true, force: true });
    await fs.rename(staged, app);
    await fs.writeFile(hashFile, SOURCE_HASH);
    return app;
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

interface HelperOutput {
  ok: boolean;
  error?: string;
  events?: CalendarEvents["events"];
  calendars?: CalendarEvents["calendars"];
}

/** Events from every calendar between two local dates, `to` exclusive. */
export async function calendarEvents(
  from: string,
  to: string,
  paths: { dataDir: string; tempDir: string },
): Promise<CalendarEvents> {
  if (process.platform !== "darwin") throw new Error("Calendar access needs macOS Calendar on the vault's machine.");
  const app = await helperApp(paths.dataDir, paths.tempDir);
  await fs.mkdir(paths.tempDir, { recursive: true });
  const out = nodePath.join(paths.tempDir, `calendar-${randomUUID()}.json`);
  try {
    // -n: a second copy per call, so concurrent calls don't attach to one run.
    await run("/usr/bin/open", ["-W", "-g", "-n", app, "--args", "--from", from, "--to", to, "--out", out], { timeout: LAUNCH_TIMEOUT_MS });
    const text = await fs.readFile(out, "utf8").catch(() => null);
    if (text === null) throw new Error("The calendar helper exited without writing any events.");
    const result = JSON.parse(text) as HelperOutput;
    if (!result.ok) throw new Error(result.error ?? "The calendar helper failed.");
    return { events: result.events ?? [], calendars: result.calendars ?? [] };
  } finally {
    await fs.rm(out, { force: true });
  }
}
