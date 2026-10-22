import { useBoard } from "./data";

export function SettingsSection() {
  const { board } = useBoard();
  const sync = board?.sync ?? null;
  return (
    <div className="space-y-3 text-sm">
      <p>
        Cards come from the GitHub searches configured under Sources on the Kanban page (by default your open PRs
        tagged <code className="text-xs">#my-prs</code> and review requests tagged <code className="text-xs">#pr-reviews</code>).
      </p>
      {sync === null ? null : (
        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
          <dt className="text-muted-foreground">Token</dt>
          <dd>{sync.tokenSource === "none" ? "none found" : sync.tokenSource === "setting" ? "plugin setting" : "gh CLI"}</dd>
          <dt className="text-muted-foreground">Signed in as</dt>
          <dd>{sync.login ?? "unknown"}</dd>
          <dt className="text-muted-foreground">Jira</dt>
          <dd>{sync.jiraSite ?? <span className="text-muted-foreground">not configured (site URL, email, and API token settings)</span>}</dd>
          <dt className="text-muted-foreground">Last sync</dt>
          <dd className="tabular-nums">{sync.lastSyncAt === null ? "never" : new Date(sync.lastSyncAt).toLocaleString()}</dd>
          {sync.lastError !== null ? (
            <>
              <dt className="text-destructive">Error</dt>
              <dd className="text-destructive">{sync.lastError}</dd>
            </>
          ) : null}
        </dl>
      )}
    </div>
  );
}
