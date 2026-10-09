import { enter } from "bb-motion";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useChangedSinceMount } from "../ui/use-changed-since-mount.js";
import {
  getThreadListIndicatorLabel,
  resolveThreadListIndicator,
  type ThreadListIndicatorKind,
  type ThreadListIndicatorState,
} from "../model/thread-activity.js";

const ICON_SIZE_CLASS = "size-3.5";
const WORKING_COLOR_CLASS = "text-muted-foreground/50";
const UNREAD_SUCCESS_DOT_CLASS =
  "size-[5px] rounded-full bg-muted-foreground/60 max-md:pointer-coarse:size-1.5";

const WORKING_ACTIVITY_ICONS = {
  workflow: "Workflow",
  "background-agent": "UserRoundPlus",
  "background-command": "Terminal",
  "plan-mode": "ListTodo",
  goal: "Target",
} satisfies Partial<Record<ThreadListIndicatorKind, IconName>>;

const WAITING_ICONS = {
  "waiting-for-input": "CircleQuestion",
  "queued-waiting": "Clock",
} satisfies Partial<Record<ThreadListIndicatorKind, IconName>>;

function ThreadDraftIndicator({ isWorking }: { isWorking: boolean }) {
  const label = getThreadListIndicatorLabel(
    isWorking ? "working-draft" : "draft",
  );
  return (
    <Icon
      name="Edit"
      className={cn(
        "pointer-events-none shrink-0",
        ICON_SIZE_CLASS,
        isWorking
          ? ["animate-shine-icon", WORKING_COLOR_CLASS]
          : "text-muted-foreground",
      )}
      aria-label={label ?? undefined}
    />
  );
}

function glyphFor(kind: ThreadListIndicatorKind) {
  switch (kind) {
    case "unread-error":
    case "queued-failed":
      return (
        <Icon
          name="CircleX"
          className={cn("text-destructive", ICON_SIZE_CLASS)}
          aria-label={getThreadListIndicatorLabel(kind) ?? undefined}
        />
      );
    case "waiting-for-input":
    case "queued-waiting":
      return (
        <Icon
          name={WAITING_ICONS[kind]}
          className={cn("text-muted-foreground/75", ICON_SIZE_CLASS)}
          aria-label={getThreadListIndicatorLabel(kind) ?? undefined}
        />
      );
    case "working-draft":
      return <ThreadDraftIndicator isWorking />;
    case "workflow":
    case "background-agent":
    case "background-command":
    case "plan-mode":
    case "goal":
      return (
        <Icon
          name={WORKING_ACTIVITY_ICONS[kind]}
          className={cn(
            "animate-shine-icon",
            WORKING_COLOR_CLASS,
            ICON_SIZE_CLASS,
          )}
          aria-label={getThreadListIndicatorLabel(kind) ?? undefined}
        />
      );
    case "runtime":
      return (
        <Icon
          name="Loading"
          className={cn(
            "animate-spin motion-reduce:animate-none",
            WORKING_COLOR_CLASS,
            ICON_SIZE_CLASS,
          )}
          aria-label={getThreadListIndicatorLabel(kind) ?? undefined}
        />
      );
    case "draft":
      return <ThreadDraftIndicator isWorking={false} />;
    case "unread-success":
      return (
        <span
          className={UNREAD_SUCCESS_DOT_CLASS}
          aria-label={getThreadListIndicatorLabel(kind) ?? undefined}
        />
      );
    case "none":
      return null;
  }
}

export function ThreadStatusGlyph(state: ThreadListIndicatorState) {
  const kind = resolveThreadListIndicator(state);
  const changed = useChangedSinceMount(kind);
  const glyph = glyphFor(kind);
  if (!changed || glyph === null) return glyph;
  // The pop lives on a wrapper because the shine and spin glyphs already own
  // `animation`; keying it by kind replays the pop on every later change.
  return (
    <span key={kind} className={cn("inline-flex shrink-0", enter.pop)}>
      {glyph}
    </span>
  );
}
