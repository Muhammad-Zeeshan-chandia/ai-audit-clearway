import { cn } from "@/lib/utils";

interface ProgressProps {
  value?: number; // 0-100, undefined = indeterminate
  className?: string;
}

export function Progress({ value, className }: ProgressProps) {
  const isIndeterminate = value === undefined;

  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[--bg-tertiary]", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full bg-[--accent] transition-all",
          isIndeterminate && "animate-indeterminate"
        )}
        style={isIndeterminate ? undefined : { width: `${value}%` }}
      />
    </div>
  );
}
