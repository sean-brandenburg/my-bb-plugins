import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PRESS, SOFT, STAGGER, cx, enter, speed, stagger } from "bb-motion";
import { UrlLink, useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import type { PluginRpcResult } from "@get-bb/plugin-sdk";
import type { FileEntry } from "../../contract";
import type { rpcContract } from "../../rpc-contract";
import { plainListText } from "../../shared/daily";
import { errorMessage } from "../../shared/errors";
import { dirname, noteTitle } from "../../shared/obsidian";
import { LoadingLines } from "../Loading";
import { PANEL_PATH, calendarSubPath, useOpenNote } from "../navigation";
import { useVaultChanges, type Vault } from "../vault-client";
import { CaptureInput, openToday, startRoutine } from "./capture";

type DashboardData = PluginRpcResult<(typeof rpcContract)["dashboard"]>;

const ACTIVITY_REFRESH_MS = 60_000;

const ROW_ENTRANCE = cx(enter.rise, speed.fast, STAGGER);

/** A card with a tinted header row naming the group and its count, so each section reads as one unit. */
function Section({ title, count, aside, index, children }: { title: string; count?: number; aside?: ReactNode; index: number; children: ReactNode }) {
  return (
    <section className={cx("ob-dash-card", enter.rise, STAGGER)} style={stagger(index)} aria-label={title}>
      <h3 className="ob-dash-card-header">
        <span className="font-medium">{title}</span>
        {count === undefined ? null : <span className="ob-dash-count">{count}</span>}
        {aside === undefined ? null : <span className="ml-auto text-xs font-normal text-muted-foreground">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-2.5 text-sm text-muted-foreground">{children}</p>;
}

export function Dashboard({ vault, recent }: { vault: Vault; recent: readonly FileEntry[] }) {
  const { rpc, status } = vault;
  const openNote = useOpenNote();
  const navigate = useBbNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    rpc.call("dashboard").then(
      (next) => {
        setData(next);
        setError(null);
      },
      (cause) => setError(errorMessage(cause)),
    );
  }, [rpc]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, ACTIVITY_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);
  useVaultChanges(() => refresh());

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const activeTickets = data?.tickets.filter((ticket) => !ticket.done) ?? [];
  const doneTickets = (data?.tickets.length ?? 0) - activeTickets.length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="ob-dash mx-auto w-full max-w-2xl px-6 pb-16 pt-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold">{dateLabel}</h2>
          <span className="ob-dash-vault truncate text-xs text-muted-foreground">{status?.vaultName}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" data-nav-row="toolbar">
          <Button size="sm" onClick={() => void openToday()}>
            {data?.today.exists === false ? "Create today's note" : "Open today's note"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void startRoutine("start")}>
            Start day
          </Button>
          <Button size="sm" variant="outline" onClick={() => void startRoutine("wrap")}>
            Wrap up day
          </Button>
          <Button size="sm" variant="outline" aria-label="Calendar (gc)" onClick={() => navigate.toPluginPanel(PANEL_PATH, { subPath: calendarSubPath() })}>
            Calendar
          </Button>
        </div>
        {error === null ? null : <p className="mt-4 text-sm text-destructive">{error}</p>}

        <div className="mt-5 flex flex-col gap-4">
          <Section title="Today's inbox" count={data?.today.inbox.length} index={0}>
            <div className="px-3 pt-2.5">
              <CaptureInput className="ob-capture-dashboard" />
            </div>
            {data === null ? (
              <LoadingLines lines={2} className="px-3 py-3" />
            ) : data.today.inbox.length === 0 ? (
              <Empty>Nothing captured yet today.</Empty>
            ) : (
              <ul className="px-3 py-2 text-sm">
                {/* No stagger: entries arrive one at a time as they're logged, and a new one shouldn't wait on its index. */}
                {data.today.inbox.map((line, index) => (
                  <li key={index} className={cx("ob-dash-row whitespace-pre-wrap", enter.rise, speed.fast)}>
                    {plainListText(line)}
                  </li>
                ))}
              </ul>
            )}
            <p className="ob-dash-card-footer">
              <kbd>⌘⇧L</kbd> logs from anywhere in bb · “Save to today's daily note” on any chat message · <code>bb obsidian log</code> from agents · <kbd>?</kbd> lists the keys
            </p>
          </Section>

          {data !== null && data.carryForward.items.length > 0 ? (
            <Section
              title="Carried forward"
              count={data.carryForward.items.length}
              index={1}
              aside={
                data.carryForward.path === null ? undefined : (
                  <button type="button" className="ob-link" data-nav-row="item" onClick={() => openNote(data.carryForward.path!)}>
                    from {noteTitle(data.carryForward.path)}
                  </button>
                )
              }
            >
              <ul className="px-3 py-2 text-sm">
                {data.carryForward.items.map((item, index) => (
                  <li key={index} className={cx("ob-dash-row", ROW_ENTRANCE)} style={stagger(index)}>
                    ☐ {plainListText(item)}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Active tickets" count={activeTickets.length} index={2} aside={doneTickets > 0 ? `${doneTickets} closed ticket notes not shown.` : undefined}>
            {activeTickets.length === 0 ? (
              <Empty>No open ticket notes. The daily-note routines create one in Tickets/ when you start on a Jira ticket.</Empty>
            ) : (
              <ul className="divide-y divide-border">
                {activeTickets.map((ticket, index) => (
                  <li key={ticket.path} className={cx("ob-ticket-row", ROW_ENTRANCE)} style={stagger(index)}>
                    <button type="button" className="ob-link ob-ticket-key" data-nav-row="item" onClick={() => openNote(ticket.path)}>
                      {ticket.key}
                    </button>
                    <span className="min-w-0 flex-1 truncate">{ticket.summary}</span>
                    <span className="ob-ticket-aside">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{ticket.status || "—"}</span>
                      {ticket.url === null ? null : (
                        <UrlLink href={ticket.url} className="text-xs text-muted-foreground hover:text-foreground">
                          Jira
                        </UrlLink>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Recently edited" index={3}>
            <ul className="divide-y divide-border">
              {recent.map((file, index) => (
                <li key={file.path} className={ROW_ENTRANCE} style={stagger(index)}>
                  <button type="button" className={cx("ob-recent-row", PRESS, SOFT)} data-nav-row="item" data-path={file.path} onClick={() => openNote(file.path)}>
                    <span className="truncate">{noteTitle(file.path)}</span>
                    {dirname(file.path) === "" ? null : <span className="ob-recent-folder">{dirname(file.path)}</span>}
                    <span className="ob-recent-date">{new Date(file.mtimeMs).toLocaleDateString()}</span>
                  </button>
                </li>
              ))}
              {recent.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">No notes yet.</li> : null}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
