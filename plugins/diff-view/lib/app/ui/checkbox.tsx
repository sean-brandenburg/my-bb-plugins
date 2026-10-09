import * as React from "react";

import { cn } from "../utils";
import { CONTROL_HOVER_TRANSITION } from "./motion.js";
import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";

export interface CheckboxProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "title"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** The kanban checkbox's look without @radix-ui/react-checkbox, which bb bundles rather than shims. */
const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(({ className, checked, onCheckedChange, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    role="checkbox"
    aria-checked={checked}
    data-state={checked ? "checked" : "unchecked"}
    className={cn(
      `peer flex size-4 shrink-0 items-center justify-center rounded-sm border border-input shadow-xs ${CONTROL_HOVER_TRANSITION} focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background`,
      className,
    )}
    onClick={() => onCheckedChange(!checked)}
    {...props}
  >
    {checked ? <Icon name="Check" className="size-3.5" /> : null}
  </button>
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
