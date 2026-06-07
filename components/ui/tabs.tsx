"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabItem {
  key: string;
  label: string;
  badge?: number | string;
}

interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ items, active, onChange, className }: TabsProps) {
  return (
    <div className={cn("flex border-b border-[--border]", className)}>
      {items.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors",
            active === tab.key
              ? "border-[--accent] text-[--accent]"
              : "border-transparent text-[--text-secondary] hover:text-[--text-primary]"
          )}
        >
          {tab.label}
          {tab.badge !== undefined && (
            <span className={cn(
              "rounded px-1.5 py-0.5 text-xs font-semibold",
              active === tab.key
                ? "bg-[--accent-light] text-[--accent]"
                : "bg-[--bg-tertiary] text-[--text-tertiary]"
            )}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
