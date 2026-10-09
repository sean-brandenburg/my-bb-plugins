import * as React from "react";

import { cn } from "../utils";
import { enter, PRESS } from "./motion.js";
import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";

export interface CheckboxProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "title"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

// The shared pop starts at 0.94, too faint on a 14px glyph. Reduced motion needs the scale back at 1 because this
// element-level value outranks the :root override in motion.css.
const CHECK_POP = `${enter.pop} [--bbm-scale-pop:0.5] motion-reduce:[--bbm-scale-pop:1]`;

/** A check that springs in only when the user ticks it, not when marks arrive from the server. */
function CheckMark({ clicked }: { clicked: React.RefObject<boolean> }) {
  const [pop] = React.useState(() => clicked.current);
  return <Icon name="Check" className={cn("size-3.5", pop && CHECK_POP)} />;
}

/** The kanban checkbox's look without @radix-ui/react-checkbox, which bb bundles rather than shims. */
const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(({ className, checked, onCheckedChange, ...props }, ref) => {
  const clicked = React.useRef(false);
  React.useEffect(() => {
    clicked.current = false;
  });
  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      className={cn(
        `peer flex size-4 shrink-0 items-center justify-center rounded-sm border border-input shadow-xs ${PRESS} focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background`,
        className,
      )}
      onClick={() => {
        clicked.current = true;
        onCheckedChange(!checked);
      }}
      {...props}
    >
      {checked ? <CheckMark clicked={clicked} /> : null}
    </button>
  );
});
Checkbox.displayName = "Checkbox";

export { Checkbox };
