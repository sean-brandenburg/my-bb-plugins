import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import { Button, COMPACT } from "./ui/button";
import { cn } from "./utils";
import { requestReload, useDiffInstance } from "./state";

/** Refetches the diff of the view mounted with the same `instanceKey`, spinning while it loads. */
export function DiffRefreshButton({ instanceKey }: { instanceKey: string }) {
  const { loading } = useDiffInstance(instanceKey);
  return (
    <Button type="button" variant="ghost" className={cn(COMPACT, "px-1.5")} disabled={loading} onClick={() => requestReload(instanceKey)} aria-label="Refresh diff">
      <Icon name="diff-view-refresh" className={cn("size-3.5", loading && "animate-spin")} />
    </Button>
  );
}
