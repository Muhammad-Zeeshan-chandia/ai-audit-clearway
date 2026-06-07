"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export function Dialog({ open, onClose, title, description, children, className, size = "md" }: DialogProps) {
  // Close on Escape key
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel */}
      <div
        className={cn(
          "relative z-10 w-full rounded-md border border-[--border] bg-[--bg-primary] shadow",
          sizeClasses[size],
          className
        )}
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex items-start justify-between border-b border-[--border] px-5 py-4">
            <div>
              {title && <h2 className="text-base font-semibold text-[--text-primary]">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-[--text-secondary]">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="ml-4 rounded-md p-1 text-[--text-tertiary] hover:bg-[--bg-secondary] hover:text-[--text-primary] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-end gap-2 border-t border-[--border] px-5 py-3 mt-2", className)}>
      {children}
    </div>
  );
}
