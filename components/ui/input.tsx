import * as React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "w-full rounded-md border bg-[--bg-tertiary] px-3 py-2 text-sm text-[--text-primary]",
          "placeholder:text-[--text-tertiary]",
          "border-[--border] focus:border-[--border-strong] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[--accent]/20",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "transition-colors",
          error && "border-[--danger] focus:ring-[--danger]/20",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
