import { Component } from "react";
import type { ReactNode } from "react";

/** Keeps a renderer failure inside the diff pane: shows the error and falls back to the host's plain diff. */
export class DiffErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { errors: string[] }> {
  state: { errors: string[] } = { errors: [] };
  static getDerivedStateFromError(error: Error) {
    return { errors: [error.message] };
  }
  componentDidCatch(error: Error) {
    // React can report a second error from the unmount of the failed subtree; keep every message so the first (root) cause is visible.
    this.setState((state) => (state.errors.includes(error.message) ? state : { errors: [...state.errors, error.message] }));
  }
  render() {
    if (this.state.errors.length > 0) {
      return (
        <div className="flex flex-col gap-2">
          <div className="mx-3 mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <p>Line-comment diff failed to render; showing the plain diff instead.</p>
            <ul className="mt-1 list-disc pl-4">
              {this.state.errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
          {this.props.fallback}
        </div>
      );
    }
    return this.props.children;
  }
}
