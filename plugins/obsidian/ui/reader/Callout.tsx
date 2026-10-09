import { Children, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

const CALLOUT_ICONS: Record<string, string> = {
  note: "Edit",
  info: "Info",
  tip: "Star",
  hint: "Star",
  important: "AlertCircle",
  success: "CircleCheck",
  check: "CircleCheck",
  done: "CircleCheck",
  question: "CircleQuestion",
  help: "CircleQuestion",
  faq: "CircleQuestion",
  warning: "AlertTriangle",
  caution: "AlertTriangle",
  attention: "AlertTriangle",
  failure: "CircleX",
  fail: "CircleX",
  missing: "CircleX",
  danger: "Zap",
  error: "Zap",
  bug: "Bug",
  example: "ListView",
  quote: "AlignLeft",
  cite: "AlignLeft",
  abstract: "FileText",
  summary: "FileText",
  tldr: "FileText",
  todo: "CircleCheck",
};

/** An Obsidian callout (`> [!type][+-] Title`), foldable when it has a fold marker. */
export function Callout({ type, title, fold, children }: { type: string; title: string; fold: unknown; children: ReactNode }) {
  const label = title || type.charAt(0).toUpperCase() + type.slice(1);
  const body = (
    <div className="ob-callout-body">{Children.toArray(children).filter((child) => typeof child !== "string" || child.trim() !== "")}</div>
  );
  const icon = <Icon name={Object.hasOwn(CALLOUT_ICONS, type) ? CALLOUT_ICONS[type] : "Edit"} fallback="Edit" className="size-4" aria-hidden />;
  if (fold === "+" || fold === "-") {
    return (
      <details className="ob-callout" data-callout={type} open={fold === "+"}>
        <summary className="ob-callout-title">
          {icon}
          {label}
        </summary>
        {body}
      </details>
    );
  }
  return (
    <div className="ob-callout" data-callout={type}>
      <div className="ob-callout-title">
        {icon}
        {label}
      </div>
      {body}
    </div>
  );
}
