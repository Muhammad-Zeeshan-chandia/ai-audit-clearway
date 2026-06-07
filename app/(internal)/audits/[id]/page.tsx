import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AuditStatusBadge, TierBadge, Badge } from "@/components/ui/badge";
import { AuditDetailTabs } from "./audit-detail-tabs";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import type { AuditStatus, FinalTier, RAG } from "@/lib/types";

function fmt(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function AuditDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const service = createServiceClient();

  const { data: audit, error } = await supabase
    .from("audits")
    .select(`
      *,
      clients(id, business_name, owner_name, email, sector, phone, website_url, shay_notes),
      audit_categories(*)
    `)
    .eq("id", params.id)
    .single();

  if (error || !audit) notFound();

  const [
    { data: questionnaire },
    { data: webhookLogs },
    { data: auditLog },
  ] = await Promise.all([
    supabase
      .from("questionnaires")
      .select("*")
      .eq("audit_id", params.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("webhook_logs")
      .select("*")
      .eq("audit_id", params.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("audit_log")
      .select("*")
      .eq("entity_id", params.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // Signed URLs (5-min expiry)
  let transcriptUrl: string | null = null;
  let pdfUrl: string | null = null;

  if (audit.transcript_path) {
    const { data } = await service.storage
      .from("transcripts")
      .createSignedUrl(audit.transcript_path, 300);
    transcriptUrl = data?.signedUrl ?? null;
  }

  if (audit.pdf_path) {
    const { data } = await service.storage
      .from("pdfs")
      .createSignedUrl(audit.pdf_path, 300);
    pdfUrl = data?.signedUrl ?? null;
  }

  const client = audit.clients as {
    id: string;
    business_name: string;
    owner_name: string | null;
    email: string;
    sector: string | null;
    shay_notes: string | null;
  } | null;

  const categories = (audit.audit_categories ?? []) as Array<{
    id: string;
    category_number: number;
    category_name: string;
    score: number | null;
    rag: RAG | null;
    confidence: number | null;
    gbp_impact_annual: number | null;
    gbp_calculation: string | null;
    evidence: string | null;
    solution_category: string | null;
    report_section: string | null;
    insufficient_data: boolean;
    used_defaults: boolean;
    contradiction_flag: boolean;
  }>;

  // Sort categories by number
  categories.sort((a, b) => a.category_number - b.category_number);

  return (
    <div>
      {/* Back nav */}
      <Link
        href="/audits"
        className="mb-4 inline-flex items-center gap-1 text-xs text-[--text-tertiary] hover:text-[--text-secondary]"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to audits
      </Link>

      {/* Header */}
      <div className="mb-6 border-b border-[--border] pb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold text-[--text-primary]">
                {client?.business_name ?? "Audit"}
              </h1>
              <AuditStatusBadge status={audit.status as AuditStatus} />
              <TierBadge tier={(audit.final_tier as FinalTier) ?? null} />
              {audit.flagged_for_review && (
                <Badge variant="warning">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Flagged for review
                </Badge>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-4 text-sm text-[--text-secondary]">
              {client && (
                <Link href={`/clients/${client.id}`} className="hover:text-[--accent]">
                  {client.email}
                </Link>
              )}
              {audit.total_opportunity_gbp != null && (
                <span className="font-semibold tabular-nums text-[--text-primary]">
                  {fmt(Number(audit.total_opportunity_gbp))} opportunity identified
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <AuditDetailTabs
        audit={{
          id: audit.id,
          status: audit.status as AuditStatus,
          total_opportunity_gbp: audit.total_opportunity_gbp != null ? Number(audit.total_opportunity_gbp) : null,
          final_tier: audit.final_tier as string | null,
          flagged_for_review: Boolean(audit.flagged_for_review),
          flag_reasons: (audit.flag_reasons ?? []) as string[],
          created_at: audit.created_at,
          questionnaire_submitted_at: audit.questionnaire_submitted_at as string | null,
          audit_run_at: audit.audit_run_at as string | null,
          reviewed_at: audit.reviewed_at as string | null,
          reviewed_by: audit.reviewed_by as string | null,
          review_notes: audit.review_notes as string | null,
          sent_at: audit.sent_at as string | null,
          transcript_path: audit.transcript_path as string | null,
          pdf_path: audit.pdf_path as string | null,
        }}
        client={client}
        categories={categories}
        questionnaire={questionnaire}
        webhookLogs={webhookLogs ?? []}
        auditLog={auditLog ?? []}
        transcriptUrl={transcriptUrl}
        pdfUrl={pdfUrl}
        fmt={fmt}
      />
    </div>
  );
}
