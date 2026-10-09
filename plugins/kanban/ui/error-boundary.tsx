import { Component } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { COMPACT } from "./primitives";

/**
 * The host's own fallback only says "plugin kanban crashed" and logs the cause to the devtools console. This boundary
 * sits inside each slot so the message and component stack show on the page, with a retry that remounts the subtree.
 */
class PluginErrorBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null; stack: string | null }> {
  state: { error: Error | null; stack: string | null } = { error: null, stack: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    this.setState({ stack: info.componentStack ?? null });
    console.error(`[kanban] ${this.props.name} crashed:`, error, info.componentStack);
  }
  render() {
    const { error, stack } = this.state;
    if (error === null) return this.props.children;
    const details = `${error.name}: ${error.message}\n${error.stack ?? ""}\n\nComponent stack:${stack ?? " (none)"}`;
    return (
      <div className="m-3 flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
        <p className="font-medium text-destructive">Kanban {this.props.name} crashed</p>
        <p className="break-words font-mono text-xs">{error.message}</p>
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Stack trace</summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] text-muted-foreground">{details}</pre>
        </details>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className={COMPACT} onClick={() => this.setState({ error: null, stack: null })}>
            Retry
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={COMPACT}
            onClick={() => {
              void navigator.clipboard?.writeText(details);
              toast.message("Error details copied");
            }}
          >
            Copy details
          </Button>
        </div>
      </div>
    );
  }
}

export function withErrorBoundary<P extends object>(name: string, Inner: (props: P) => ReactNode) {
  return function Guarded(props: P) {
    return (
      <PluginErrorBoundary name={name}>
        <Inner {...props} />
      </PluginErrorBoundary>
    );
  };
}
