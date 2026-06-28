"use client";

import { cn } from "@/lib/utils";
import type { AuditStatus, FinalTier, RAG, ProposalStatus } from "@/lib/types";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "accent" | "neutral";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:  "bg-[--bg-tertiary] text-[--text-secondary]",
  success:  "bg-emerald-50 text-emerald-700",
  warning:  "bg-amber-50 text-amber-700",
  danger:   "bg-red-50 text-red-700",
  accent:   "bg-[--accent-light] text-[--accent]",
  neutral:  "bg-slate-100 text-slate-600",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function AuditStatusBadge({ status }: { status: AuditStatus }) {
  const map: Record<AuditStatus, { label: string; variant: BadgeVariant }> = {
    awaiting_questionnaire: { label: "Awaiting questionnaire", variant: "neutral" },
    audit_running:          { label: "Audit running",          variant: "accent"  },
    awaiting_review:             { label: "Awaiting review",     variant: "warning" },
    awaiting_client_followup:    { label: "Awaiting follow-up",  variant: "neutral" },
    followup_received:           { label: "Follow-up received",  variant: "warning" },
    awaiting_answers:            { label: "Awaiting answers",    variant: "neutral" },
    answers_received:            { label: "Answers received",    variant: "warning" },
    final_review:                { label: "Final review",        variant: "warning" },
    approved:                    { label: "Approved",            variant: "success" },
    sent:                   { label: "Sent",                   variant: "success" },
    failed:                 { label: "Failed",                 variant: "danger"  },
    archived:               { label: "Archived",               variant: "neutral" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "default" };
  return <Badge variant={variant}>{label}</Badge>;
}

export function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  const map: Record<ProposalStatus, { label: string; variant: BadgeVariant }> = {
    generating: { label: "Generating", variant: "accent"  },
    ready:      { label: "Ready",      variant: "warning" },
    sending:    { label: "Sending",    variant: "accent"  },
    sent:       { label: "Sent",       variant: "success" },
    failed:     { label: "Failed",     variant: "danger"  },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "default" };
  return <Badge variant={variant}>{label}</Badge>;
}

export function TierBadge({ tier }: { tier: FinalTier | null }) {
  if (!tier) return <Badge variant="neutral">—</Badge>;
  const map: Record<FinalTier, BadgeVariant> = {
    Starter:    "neutral",
    Standard:   "default",
    Growth:     "accent",
    Established:"success",
    Enterprise: "warning",
  };
  return <Badge variant={map[tier] ?? "default"}>{tier}</Badge>;
}

export function RAGBadge({ rag }: { rag: RAG | null }) {
  if (!rag) return null;
  const map: Record<RAG, BadgeVariant> = {
    RED:   "danger",
    AMBER: "warning",
    GREEN: "success",
  };
  return <Badge variant={map[rag]}>{rag}</Badge>;
}
