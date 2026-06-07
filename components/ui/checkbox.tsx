import * as React from "react";
import { cn } from "@/lib/utils";

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  error?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        <label
          htmlFor={id}
          className={cn(
            "flex items-start gap-2.5 cursor-pointer",
            props.disabled && "cursor-not-allowed opacity-50"
          )}
        >
          <input
            ref={ref}
            type="checkbox"
            id={id}
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 rounded border border-[--border] accent-[--accent]",
              "focus:outline-none focus:ring-2 focus:ring-[--accent] focus:ring-offset-1",
              className
            )}
            {...props}
          />
          {label && (
            <span className="text-sm text-[--text-primary] leading-snug">{label}</span>
          )}
        </label>
        {error && (
          <p className="text-xs text-[--danger]">{error}</p>
        )}
      </div>
    );
  }
);
Checkbox.displayName = "Checkbox";
