import { Button } from "@/components/ui/button";
import { dateKeyOfDailyPath } from "../../shared/daily";
import type { VaultStatus } from "../vault-client";
import { startRoutine } from "./capture";

/** Start day / Wrap up in the header of today's daily note; nothing on any other note. */
export function DailyNoteActions({ path, status, flush }: { path: string; status: VaultStatus; flush: () => Promise<void> }) {
  if (dateKeyOfDailyPath(status.dailyFolder, path) !== status.todayKey) return null;
  return (
    <>
      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => void flush().then(() => startRoutine("start"))}>
        Start day
      </Button>
      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => void flush().then(() => startRoutine("wrap"))}>
        Wrap up
      </Button>
    </>
  );
}
