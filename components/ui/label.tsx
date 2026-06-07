import * as React from "react";
import { cn } from "@/lib/utils";

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, children, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          "block text-sm font-medium text-[--text-primary] mb-1.5",
          className
        )}
        {...props}
      >
        {children}
        {required && (
          <span className="ml-1 text-[--danger]" aria-hidden>
            *
          </span>
        )}
      </label>
    );
  }
);
Label.displayName = "Label";
