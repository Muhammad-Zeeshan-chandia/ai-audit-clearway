"use client";

import { useRouter } from "next/navigation";
import { ProposalStatusBadge } from "@/components/ui/badge";
import type { ProposalStatus } from "@/lib/types";

function fmt(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

interface ProposalRow {
  id: string;
  audit_id: string;
  status: ProposalStatus;
  regenerate_count: number;
  pdf_generated_at: string | null;
  sent_at: string | null;
  created_at: string;
  business_name: string;
  total_opportunity_gbp: number | null;
  final_tier: string | null;
}

export function ProposalsTable({ proposals }: { proposals: ProposalRow[] }) {
  const router = useRouter();

  if (proposals.length === 0) {
    return (
      <p className="rounded-md border border-[--border] bg-[--bg-secondary] px-4 py-8 text-center text-sm text-[--text-secondary]">
        No proposals yet. Build one from a finished audit using <strong>Build Proposal</strong>.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-[--border]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[--border] bg-[--bg-secondary] text-left">
            <th className="px-4 py-2.5 font-semibold text-[--text-secondary]">Business</th>
            <th className="px-4 py-2.5 font-semibold text-[--text-secondary]">Status</th>
            <th className="px-4 py-2.5 font-semibold text-[--text-secondary]">Tier</th>
            <th className="px-4 py-2.5 font-semibold text-[--text-secondary]">Opportunity</th>
            <th className="px-4 py-2.5 font-semibold text-[--text-secondary]">Regenerated</th>
            <th className="px-4 py-2.5 font-semibold text-[--text-secondary]">Generated</th>
            <th className="px-4 py-2.5 font-semibold text-[--text-secondary]">Sent</th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((p) => (
            <tr
              key={p.id}
              onClick={() => router.push(`/proposals/${p.id}`)}
              className="cursor-pointer border-b border-[--border] last:border-0 hover:bg-[--bg-secondary]"
            >
              <td className="px-4 py-2.5 font-medium text-[--text-primary]">{p.business_name}</td>
              <td className="px-4 py-2.5"><ProposalStatusBadge status={p.status} /></td>
              <td className="px-4 py-2.5 text-[--text-secondary]">{p.final_tier ?? "—"}</td>
              <td className="px-4 py-2.5 tabular-nums text-[--text-secondary]">
                {p.total_opportunity_gbp != null ? fmt(p.total_opportunity_gbp) : "—"}
              </td>
              <td className="px-4 py-2.5 text-[--text-tertiary]">
                {p.regenerate_count > 0 ? `${p.regenerate_count}×` : "—"}
              </td>
              <td className="px-4 py-2.5 text-[--text-tertiary]">{date(p.pdf_generated_at)}</td>
              <td className="px-4 py-2.5 text-[--text-tertiary]">{date(p.sent_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
