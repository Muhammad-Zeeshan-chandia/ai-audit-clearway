import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { ProposalPanel } from "./proposal-panel";
import type { ProposalStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProposalDetailPage({ params }: { params: { id: string } }) {
  const service = createServiceClient();

  const { data: proposal, error } = await service
    .from("proposals")
    .select(
      "id, audit_id, status, pdf_path, pdf_generated_at, instructions, regenerate_count, sent_at, created_at, clients(business_name), audits(total_opportunity_gbp, final_tier)"
    )
    .eq("id", params.id)
    .single();

  if (error || !proposal) notFound();

  const rawClient = proposal.clients as { business_name: string }[] | { business_name: string } | null;
  const client = Array.isArray(rawClient) ? rawClient[0] : rawClient;
  const rawAudit = proposal.audits as
    | { total_opportunity_gbp: number | null; final_tier: string | null }[]
    | { total_opportunity_gbp: number | null; final_tier: string | null }
    | null;
  const audit = Array.isArray(rawAudit) ? rawAudit[0] : rawAudit;

  // Sign the proposal PDF (stored in the `pdfs` bucket, path may include the
  // bucket prefix) so it can be viewed in the browser.
  let pdfUrl: string | null = null;
  if (proposal.pdf_path) {
    const key = String(proposal.pdf_path).replace(/^pdfs\//, "");
    const { data } = await service.storage.from("pdfs").createSignedUrl(key, 300);
    pdfUrl = data?.signedUrl ?? null;
  }

  const { data: webhookLogs } = await service
    .from("webhook_logs")
    .select("id, direction, endpoint, response_status, created_at")
    .eq("audit_id", proposal.audit_id as string)
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div>
      <Link
        href="/proposals"
        className="mb-4 inline-flex items-center gap-1 text-xs text-[--text-tertiary] hover:text-[--text-secondary]"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to proposals
      </Link>

      <ProposalPanel
        proposal={{
          id: proposal.id as string,
          audit_id: proposal.audit_id as string,
          status: proposal.status as ProposalStatus,
          pdf_path: proposal.pdf_path as string | null,
          pdf_generated_at: proposal.pdf_generated_at as string | null,
          instructions: proposal.instructions as string | null,
          regenerate_count: Number(proposal.regenerate_count ?? 0),
          sent_at: proposal.sent_at as string | null,
          created_at: proposal.created_at as string,
        }}
        businessName={client?.business_name ?? "Unknown business"}
        finalTier={(audit?.final_tier as string | null) ?? null}
        totalOpportunityGbp={audit?.total_opportunity_gbp != null ? Number(audit.total_opportunity_gbp) : null}
        pdfUrl={pdfUrl}
        webhookLogs={webhookLogs ?? []}
      />
    </div>
  );
}
