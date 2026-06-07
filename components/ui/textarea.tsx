import * as React from "react";
import { cn } from "@/lib/utils";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "block w-full rounded-md border bg-[--bg-primary] px-3 py-2 text-sm text-[--text-primary]",
          "placeholder:text-[--text-tertiary]",
          "focus:outline-none focus:ring-2 focus:ring-[--accent] focus:ring-offset-0",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "resize-y min-h-[80px]",
          error
            ? "border-[--danger] focus:ring-[--danger]"
            : "border-[--border] focus:border-[--border-strong]",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";
