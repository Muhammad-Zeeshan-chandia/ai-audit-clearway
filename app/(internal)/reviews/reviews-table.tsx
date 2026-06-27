import React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Badge, AuditStatusBadge } from "@/components/ui/badge";
import type { AuditStatus } from "@/lib/types";

interface ReviewAudit {
  id: string;
  status: AuditStatus;
  total_opportunity_gbp: number | null;
  flagged_for_review: boolean;
  flag_reasons: string[] | null;
  audit_run_at: string | null;
  final_tier: string | null;
  pdf_ready: boolean;
  client: { business_name: string; email: string } | null;
}

interface Props {
  audits: ReviewAudit[];
}

function fmt(v: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency", currency: "GBP", maximumFractionDigits: 0,
  }).format(v);
}

// Next action prompt per stage — the actual buttons live on the detail page.
function nextAction(a: ReviewAudit): string {
  switch (a.status) {
    case "awaiting_review":   return "Review · Ask Questions";
    case "awaiting_answers":  return "Waiting for client answers";
    case "answers_received":  return "Run Final Audit";
    case "final_review":      return a.pdf_ready ? "Approve & Send" : "Generate PDF";
    default:                  return "Open";
  }
}

export function ReviewsTable({ audits }: Props) {
  if (audits.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-md border border-[--border]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[--border] bg-[--bg-secondary]">
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Business</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Stage</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Tier</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Opportunity</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Next step</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[--text-secondary]"></th>
          </tr>
        </thead>
        <tbody>
          {audits.map((audit) => (
            <tr key={audit.id} className="border-b border-[--border] last:border-0 hover:bg-[--bg-secondary] transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {audit.flagged_for_review && (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[--warning]" />
                  )}
                  <div>
                    <span className="font-medium text-[--text-primary]">{audit.client?.business_name ?? "—"}</span>
                    <p className="text-xs text-[--text-tertiary]">{audit.client?.email ?? ""}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3"><AuditStatusBadge status={audit.status} /></td>
              <td className="px-4 py-3">
                {audit.final_tier
                  ? <Badge variant="neutral">{String(audit.final_tier)}</Badge>
                  : <span className="text-[--text-tertiary]">—</span>}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-medium text-[--text-primary]">
                {audit.total_opportunity_gbp != null ? fmt(Number(audit.total_opportunity_gbp)) : "—"}
              </td>
              <td className="px-4 py-3 text-[--text-secondary]">{nextAction(audit)}</td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/audits/${audit.id}`}
                  className="text-xs font-medium text-[--accent] hover:underline whitespace-nowrap"
                >
                  Open →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
