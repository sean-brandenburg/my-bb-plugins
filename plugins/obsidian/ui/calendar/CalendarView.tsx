// The Vault page's calendar: a week strip over one day's meetings, each with the note its rule
// gives it. Enter on a meeting opens that note, creating it first when it doesn't exist yet.
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import { STAGGER, cx, enter, speed, stagger } from "bb-motion";
import { focusRow, readRows } from "bb-vim-keys";
import { UrlLink, useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { PlannedMeeting, rpcContract } from "../../rpc-contract";
import type { PluginRpcResult } from "@get-bb/plugin-sdk";
import { addDays, weekDays, weekStart } from "../../shared/calendar";
import { localDateKey, localTime } from "../../shared/daily";
import { errorMessage } from "../../shared/errors";
import { LoadingLines } from "../Loading";
import { copyToClipboard } from "../global-keys";
import { PANEL_PATH, calendarSubPath, useOpenNote } from "../navigation";
import { runListCommand } from "../vault-keys";
import type { VaultCommand } from "../vault-nav";
import type { Vault, VaultRpc } from "../vault-client";

type WeekData = PluginRpcResult<(typeof rpcContract)["meetings"]>;

/** Keys the Vault page hands the calendar while it is showing. */
export type CalendarKeys = (command: VaultCommand, count: number | null) => boolean;

/** Each week's meetings, kept across day changes and visits since reading the calendar takes a second or two. */
const weekCache = new Map<string, WeekData>();

/** How often the past/now marking is re-read. */
const CLOCK_MS = 60_000;

/** Opens the rules note, writing the starter first when there is none. */
export async function openMeetingRules(rpc: VaultRpc, openNote: (path: string) => void): Promise<void> {
  try {
    const { path, created } = await rpc.call("ensureMeetingRules");
    if (created) toast.message("Wrote an example rules note", { description: path });
    openNote(path);
  } catch (cause) {
    toast.error(errorMessage(cause));
  }
}

function dayLabel(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function shortWeekday(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
}

/** Entries the day count and the plain rows leave out: holidays, declined and canceled meetings. */
function isAside(meeting: PlannedMeeting): boolean {
  return meeting.allDay || meeting.declined || meeting.canceled;
}

function badges(meeting: PlannedMeeting): string[] {
  const list: string[] = [];
  if (meeting.canceled) list.push("canceled");
  else if (meeting.declined) list.push("declined");
  else if (meeting.myStatus !== null && meeting.myStatus !== "accepted") list.push(meeting.myStatus);
  if (meeting.allDay) list.push("all day");
  return list;
}

function meetingMeta(meeting: PlannedMeeting): string {
  return [
    meeting.organizer,
    meeting.attendees > 0 ? `${meeting.attendees} ${meeting.attendees === 1 ? "person" : "people"}` : null,
    meeting.location !== null && meeting.location !== meeting.meetingUrl ? meeting.location : null,
  ]
    .filter((part): part is string => part !== null && part !== "")
    .join(" · ");
}

function openUrl(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.click();
}

export function CalendarView({ vault, dateKey, keys }: { vault: Vault; dateKey: string; keys: MutableRefObject<CalendarKeys | null> }) {
  const { rpc, status, resolver, refreshTree } = vault;
  const navigate = useBbNavigate();
  const openNote = useOpenNote();
  const monday = weekStart(dateKey);
  const [data, setData] = useState<WeekData | null>(() => weekCache.get(monday) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const request = useRef(0);
  /** Set when keys change the day, so the cursor lands on the new day's first meeting. */
  const focusPending = useRef(false);

  const load = useCallback(
    (force: boolean) => {
      const cached = weekCache.get(monday);
      if (cached !== undefined && !force) {
        setData(cached);
        setError(null);
        return;
      }
      const seq = (request.current += 1);
      setLoading(true);
      setData(cached ?? null);
      rpc.call("meetings", { from: monday, to: addDays(monday, 7) }).then(
        (next) => {
          weekCache.set(monday, next);
          if (seq !== request.current) return;
          setData(next);
          setError(null);
          setLoading(false);
        },
        (cause) => {
          if (seq !== request.current) return;
          setError(errorMessage(cause));
          setLoading(false);
        },
      );
    },
    [rpc, monday],
  );

  useEffect(() => load(false), [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(timer);
  }, []);

  const today = localDateKey(new Date(now));
  const meetings = data?.meetings.filter((meeting) => meeting.date === dateKey) ?? [];
  const counts = new Map<string, number>();
  for (const meeting of data?.meetings ?? []) {
    if (!isAside(meeting)) counts.set(meeting.date, (counts.get(meeting.date) ?? 0) + 1);
  }

  useEffect(() => {
    if (!focusPending.current || loading || root === null) return;
    focusPending.current = false;
    const first = readRows(root).elements[0];
    if (first !== undefined) focusRow(first);
    else root.focus({ preventScroll: true });
  }, [loading, dateKey, root, meetings.length]);

  const goTo = (next: string) => {
    focusPending.current = true;
    navigate.toPluginPanel(PANEL_PATH, { subPath: calendarSubPath(next), replace: true });
  };

  const noteExists = (meeting: PlannedMeeting) => resolver.has(meeting.note.path);

  const startNote = async (meeting: PlannedMeeting) => {
    if (noteExists(meeting)) {
      openNote(meeting.note.path);
      return;
    }
    if (starting !== null) return;
    setStarting(meeting.note.path);
    try {
      const { date: _date, note: _note, ...plain } = meeting;
      const { path, created } = await rpc.call("startMeetingNote", { meeting: plain });
      if (created) toast.success("Started the meeting note", { description: path });
      await refreshTree();
      openNote(path);
    } catch (cause) {
      toast.error(`Couldn't start the note: ${errorMessage(cause)}`);
    } finally {
      setStarting(null);
    }
  };

  /** The meeting under the j/k cursor. */
  const cursorMeeting = (): PlannedMeeting | null => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || root === null || !root.contains(active)) return null;
    const index = active.closest<HTMLElement>("[data-index]")?.dataset.index;
    return index === undefined ? null : (meetings[Number(index)] ?? null);
  };

  keys.current = (command, count) => {
    if (root === null) return false;
    switch (command.kind) {
      case "list":
        if (command.motion === "left" || command.motion === "right") {
          goTo(addDays(dateKey, (count ?? 1) * (command.motion === "left" ? -1 : 1)));
          return true;
        }
        return runListCommand(root, command, { count });
      case "scroll":
        return runListCommand(root, command, { count });
      case "week":
        goTo(addDays(dateKey, 7 * (count ?? 1) * command.step));
        return true;
      case "calendar":
      case "calendarToday":
        if (dateKey !== today) goTo(today);
        return true;
      case "refresh":
        load(true);
        return true;
      case "newNote": {
        const meeting = cursorMeeting();
        if (meeting === null) return false;
        void startNote(meeting);
        return true;
      }
      case "join": {
        const meeting = cursorMeeting();
        if (meeting === null) return false;
        if (meeting.meetingUrl === null) toast.message("This meeting has no video call link.");
        else openUrl(meeting.meetingUrl);
        return true;
      }
      case "copyPath": {
        const meeting = cursorMeeting();
        if (meeting === null) return false;
        if (meeting.meetingUrl === null) toast.message("This meeting has no video call link.");
        else copyToClipboard(meeting.meetingUrl, "call link");
        return true;
      }
      case "copyLink": {
        const meeting = cursorMeeting();
        if (meeting === null) return false;
        copyToClipboard(`[[${resolver.linkTextFor(meeting.note.path)}]]`, "wikilink");
        return true;
      }
      case "rules":
        void openMeetingRules(rpc, openNote);
        return true;
      default:
        return false;
    }
  };

  const rules = data?.rules ?? null;

  return (
    <div ref={setRoot} className="ob-cal outline-none" tabIndex={-1}>
      <div className={cx("ob-cal-inner", enter.rise)}>
        <header className="ob-cal-header">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{status?.vaultName} · Calendar</p>
            <h2 className="text-xl font-semibold">
              {dayLabel(dateKey)}
              {dateKey === today ? <span className="ob-cal-badge ml-2 align-middle">today</span> : null}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="size-7" aria-label="Previous day (h)" onClick={() => goTo(addDays(dateKey, -1))}>
              <Icon name="ChevronLeft" className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" aria-label="Next day (l)" onClick={() => goTo(addDays(dateKey, 1))}>
              <Icon name="ChevronRight" className="size-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" aria-label="Today (T)" disabled={dateKey === today} onClick={() => goTo(today)}>
              Today
            </Button>
            <Button variant="ghost" size="icon" className="size-7" aria-label="Read the calendar again (R)" disabled={loading} onClick={() => load(true)}>
              <Icon name="RefreshCw" fallback="Refresh" className="size-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" aria-label="Meeting note rules (gr)" onClick={() => void openMeetingRules(rpc, openNote)}>
              Rules
            </Button>
          </div>
        </header>

        <div className="ob-cal-week" role="tablist" aria-label="Days of the week">
          {weekDays(dateKey).map((day) => (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={day === dateKey}
              className={cx("ob-cal-day", day === dateKey && "ob-cal-day-active", day === today && "ob-cal-day-today")}
              onClick={() => goTo(day)}
            >
              <span>{shortWeekday(day)}</span>
              <span className="ob-cal-day-number">{Number(day.slice(8))}</span>
              <span className="ob-cal-day-count">{counts.get(day) ?? ""}</span>
            </button>
          ))}
        </div>

        {error !== null ? (
          <div className="mt-5 rounded-lg border border-destructive/40 px-3 py-2.5 text-sm">
            <p className="text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-2 h-7 px-2 text-xs" onClick={() => load(true)}>
              Try again
            </Button>
          </div>
        ) : data === null ? (
          <LoadingLines lines={4} className="mt-6" />
        ) : meetings.length === 0 ? (
          <p className="mt-5 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">Nothing on the calendar {dateKey === today ? "today" : "that day"}.</p>
        ) : (
          <div className="ob-cal-list" role="list">
            {meetings.map((meeting, index) => {
              const exists = noteExists(meeting);
              const start = Date.parse(meeting.start);
              const end = Date.parse(meeting.end);
              const current = !meeting.allDay && start <= now && now < end;
              const past = end <= now;
              return (
                <div
                  key={`${meeting.start}-${meeting.title}-${index}`}
                  role="listitem"
                  data-nav-row="item"
                  data-index={index}
                  tabIndex={-1}
                  className={cx("ob-cal-row", current && "ob-cal-now", past && "ob-cal-past", isAside(meeting) && "ob-cal-dim", enter.rise, speed.fast, STAGGER)}
                  style={stagger(index)}
                  aria-label={`${meeting.title}, ${exists ? "open its note" : "start its note"}`}
                  onClick={() => void startNote(meeting)}
                >
                  <div className="ob-cal-time">
                    {meeting.allDay ? (
                      <span>all day</span>
                    ) : (
                      <>
                        <span>{localTime(new Date(start))}</span>
                        <span>{localTime(new Date(end))}</span>
                      </>
                    )}
                  </div>
                  <div className="ob-cal-body">
                    <div className="ob-cal-title">
                      <span>{meeting.title}</span>
                      {badges(meeting).map((badge) => (
                        <span key={badge} className="ob-cal-badge">
                          {badge}
                        </span>
                      ))}
                    </div>
                    {meetingMeta(meeting) === "" ? null : <div className="ob-cal-meta">{meetingMeta(meeting)}</div>}
                    <div className={cx("ob-cal-note", exists && "ob-cal-note-exists")} title={exists ? "The note exists" : `Enter starts it by the ${meeting.note.rule} rule`}>
                      <span className="ob-cal-note-dot" aria-hidden />
                      {meeting.note.path.replace(/\.md$/, "")}
                      {meeting.note.rule === "Meetings" ? null : <span className="ob-cal-badge ml-1.5">{meeting.note.rule}</span>}
                    </div>
                  </div>
                  <div className="ob-cal-actions" onClick={(event) => event.stopPropagation()}>
                    {meeting.meetingUrl === null ? null : (
                      <UrlLink href={meeting.meetingUrl} className="text-xs text-muted-foreground hover:text-foreground" aria-label="Join the call (gx)">
                        Join
                      </UrlLink>
                    )}
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={starting !== null} onClick={() => void startNote(meeting)}>
                      {exists ? "Open note" : starting === meeting.note.path ? "Starting…" : "Start note"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {rules === null ? null : (
          <div className="ob-cal-rules">
            {rules.exists ? (
              <p>
                Notes land where the rules in <button type="button" className="ob-link" onClick={() => void openMeetingRules(rpc, openNote)}>{rules.path.replace(/\.md$/, "")}</button> say (gr).
              </p>
            ) : (
              <p>
                No rules note yet, so every note goes to the meeting notes folder.{" "}
                <button type="button" className="ob-link" onClick={() => void openMeetingRules(rpc, openNote)}>
                  Write an example to edit
                </button>{" "}
                (gr).
              </p>
            )}
            {rules.errors.map((message) => (
              <p key={message} className="text-destructive">
                {message}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
