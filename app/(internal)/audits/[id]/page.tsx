import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ChevronLeft } from "lucide-react";
import { AuditEditor } from "./audit-editor";
import type { AuditStatus, RAG } from "@/lib/types";
import type { FieldDefinition } from "@/lib/types";

function fmt(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function AuditDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const service  = createServiceClient();

  const { data: audit, error } = await supabase
    .from("audits")
    .select(`
      *,
      clients(*),
      audit_categories(*)
    `)
    .eq("id", params.id)
    .single();

  if (error || !audit) notFound();

  const [
    { data: questionnaire },
    { data: webhookLogs },
    { data: clientFields },
    { data: questionnaireFields },
  ] = await Promise.all([
    service
      .from("questionnaires")
      .select("*")
      .eq("audit_id", params.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    service
      .from("webhook_logs")
      .select("id, direction, endpoint, response_status, created_at")
      .eq("audit_id", params.id)
      .order("created_at", { ascending: false })
      .limit(5),

    service
      .from("field_definitions")
      .select("*")
      .eq("entity", "client")
      .eq("active", true)
      .order("display_order"),

    service
      .from("field_definitions")
      .select("*")
      .eq("entity", "questionnaire")
      .eq("active", true)
      .order("display_order"),
  ]);

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

  const client = audit.clients as Record<string, unknown> | null;
  const categories = ((audit.audit_categories ?? []) as Array<{
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
  }>).sort((a, b) => a.category_number - b.category_number);

  return (
    <div>
      <Link
        href="/audits"
        className="mb-4 inline-flex items-center gap-1 text-xs text-[--text-tertiary] hover:text-[--text-secondary]"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to audits
      </Link>

      <AuditEditor
        audit={{
          id:                         audit.id,
          status:                     audit.status as AuditStatus,
          total_opportunity_gbp:      audit.total_opportunity_gbp != null ? Number(audit.total_opportunity_gbp) : null,
          final_tier:                 (audit.final_tier as string) ?? null,
          tier_overridden:            Boolean((audit as Record<string, unknown>).tier_overridden),
          audit_size_score:           (audit as Record<string, unknown>).audit_size_score != null ? Number((audit as Record<string, unknown>).audit_size_score) : null,
          flagged_for_review:         Boolean(audit.flagged_for_review),
          flag_reasons:               (audit.flag_reasons ?? []) as string[],
          executive_summary:          (audit as Record<string, unknown>).executive_summary as string | null ?? null,
          created_at:                 audit.created_at,
          questionnaire_submitted_at: audit.questionnaire_submitted_at as string | null,
          audit_run_at:               audit.audit_run_at as string | null,
          reviewed_at:                audit.reviewed_at as string | null,
          reviewed_by:                audit.reviewed_by as string | null,
          review_notes:               audit.review_notes as string | null,
          sent_at:                    audit.sent_at as string | null,
          transcript_path:            audit.transcript_path as string | null,
          pdf_path:                   audit.pdf_path as string | null,
          client_id:                  audit.client_id as string,
        }}
        client={client}
        categories={categories}
        questionnaire={questionnaire}
        webhookLogs={webhookLogs ?? []}
        transcriptUrl={transcriptUrl}
        pdfUrl={pdfUrl}
        clientFields={(clientFields ?? []) as FieldDefinition[]}
        questionnaireFields={(questionnaireFields ?? []) as FieldDefinition[]}
        fmt={fmt}
      />
    </div>
  );
}
