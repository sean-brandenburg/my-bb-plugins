import { useBoard } from "./data";

export function SettingsSection() {
  const { board } = useBoard();
  const sync = board?.sync ?? null;
  return (
    <div className="space-y-2 text-sm">
      <p>
        Cards come from the GitHub searches configured under Sources on the Kanban page (by default your open PRs
        tagged <code className="text-xs">#my-prs</code> and review requests tagged <code className="text-xs">#pr-reviews</code>).
      </p>
      {sync === null ? null : (
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            Token: {sync.tokenSource === "none" ? "none found" : sync.tokenSource === "setting" ? "plugin setting" : "gh CLI"}
          </li>
          <li>Signed in as: {sync.login ?? "unknown"}</li>
          <li>Jira: {sync.jiraSite ?? "not configured (site URL, email, and API token settings)"}</li>
          <li>Last sync: {sync.lastSyncAt === null ? "never" : new Date(sync.lastSyncAt).toLocaleString()}</li>
          {sync.lastError !== null ? <li className="text-destructive">{sync.lastError}</li> : null}
        </ul>
      )}
    </div>
  );
}
