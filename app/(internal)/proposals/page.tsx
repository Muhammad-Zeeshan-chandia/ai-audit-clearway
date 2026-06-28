import { createServiceClient } from "@/lib/supabase/server";
import { ProposalsTable } from "./proposals-table";
import type { ProposalStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type ProposalRow = {
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
};

export default async function ProposalsPage() {
  const service = createServiceClient();

  const { data: rows, count } = await service
    .from("proposals")
    .select(
      "id, audit_id, status, regenerate_count, pdf_generated_at, sent_at, created_at, clients(business_name), audits(total_opportunity_gbp, final_tier)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  const proposals: ProposalRow[] = (rows ?? []).map((r) => {
    const rawClient = r.clients as { business_name: string }[] | { business_name: string } | null;
    const client = Array.isArray(rawClient) ? rawClient[0] : rawClient;
    const rawAudit = r.audits as
      | { total_opportunity_gbp: number | null; final_tier: string | null }[]
      | { total_opportunity_gbp: number | null; final_tier: string | null }
      | null;
    const audit = Array.isArray(rawAudit) ? rawAudit[0] : rawAudit;
    return {
      id: r.id as string,
      audit_id: r.audit_id as string,
      status: r.status as ProposalStatus,
      regenerate_count: Number(r.regenerate_count ?? 0),
      pdf_generated_at: r.pdf_generated_at as string | null,
      sent_at: r.sent_at as string | null,
      created_at: r.created_at as string,
      business_name: client?.business_name ?? "Unknown business",
      total_opportunity_gbp: audit?.total_opportunity_gbp != null ? Number(audit.total_opportunity_gbp) : null,
      final_tier: (audit?.final_tier as string | null) ?? null,
    };
  });

  return (
    <div>
      <div className="mb-4 border-b border-[--border] pb-4">
        <h1 className="text-xl font-semibold text-[--text-primary]">Proposals</h1>
        <p className="mt-1 text-sm text-[--text-secondary]">
          Proposals generated from finished audits — {count ?? 0} total.
        </p>
      </div>

      <ProposalsTable proposals={proposals} />
    </div>
  );
}
