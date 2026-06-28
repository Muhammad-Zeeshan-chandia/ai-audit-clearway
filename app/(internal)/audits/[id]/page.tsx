import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ChevronLeft, Archive } from "lucide-react";
import { AuditEditor } from "./audit-editor";
import type { AuditStatus, RAG, DiscoveryCall } from "@/lib/types";
import type { FieldDefinition } from "@/lib/types";

type AuditVersion = {
  id: string;
  status: string;
  is_current: boolean;
  rebuild_count: number;
  created_at: string;
};

type ClientFollowupRow = {
  id: string;
  response_text: string;
  source: "email_form" | "manual";
  submitted_at: string;
  submitted_by_user_id: string | null;
  users: { email: string } | null;
};

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
    { data: discoveryCallRaw },
    { data: clientFollowupsRaw },
    { data: followupAnswersRaw },
    { data: siblingAuditsRaw },
    { data: proposalRaw },
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

    service
      .from("discovery_calls")
      .select("*")
      .eq("audit_id", params.id)
      .maybeSingle(),

    service
      .from("client_followups")
      .select("id, response_text, source, submitted_at, submitted_by_user_id, users(email)")
      .eq("audit_id", params.id)
      .order("submitted_at", { ascending: true }),

    service
      .from("followup_answers")
      .select("id, category_number, question_text, answer_text, submitted_at")
      .eq("audit_id", params.id)
      .order("category_number", { ascending: true }),

    service
      .from("audits")
      .select("id, status, is_current, rebuild_count, created_at")
      .eq("client_id", audit.client_id as string)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(3),

    service
      .from("proposals")
      .select("id, status")
      .eq("audit_id", params.id)
      .maybeSingle(),
  ]);

  let transcriptUrl: string | null = null;
  let pdfUrl: string | null = null;

  if (audit.transcript_path) {
    // Tolerate paths that include the bucket prefix (e.g. "transcripts/…").
    const key = String(audit.transcript_path).replace(/^transcripts\//, "");
    const { data } = await service.storage
      .from("transcripts")
      .createSignedUrl(key, 300);
    transcriptUrl = data?.signedUrl ?? null;
  }

  if (audit.pdf_path) {
    // n8n stores the path with the bucket name in it ("pdfs/…"); strip it so
    // the signed URL resolves to the actual object.
    const key = String(audit.pdf_path).replace(/^pdfs\//, "");
    const { data } = await service.storage
      .from("pdfs")
      .createSignedUrl(key, 300);
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
    missing_questions: string[] | null;
  }>).sort((a, b) => a.category_number - b.category_number);

  const auditRec = audit as Record<string, unknown>;
  const isCurrentAudit = Boolean(auditRec.is_current ?? true);
  const rebuildCount = Number(auditRec.rebuild_count ?? 0);

  const siblingAudits = (siblingAuditsRaw ?? []) as AuditVersion[];
  const currentSibling = siblingAudits.find((a) => a.is_current);

  return (
    <div>
      {/* Archived banner */}
      {!isCurrentAudit && (
        <div className="mb-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-900/20">
          <Archive className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            You&rsquo;re viewing an archived version (v{rebuildCount + 1}). The current audit is{" "}
            {currentSibling ? (
              <Link href={`/audits/${currentSibling.id}`} className="font-medium underline">
                here
              </Link>
            ) : (
              <span className="font-medium">no longer available</span>
            )}.
          </p>
        </div>
      )}

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
          final_tier:                 (auditRec.final_tier as string) ?? null,
          tier_overridden:            Boolean(auditRec.tier_overridden),
          audit_size_score:           auditRec.audit_size_score != null ? Number(auditRec.audit_size_score) : null,
          flagged_for_review:         Boolean(audit.flagged_for_review),
          flag_reasons:               (audit.flag_reasons ?? []) as string[],
          executive_summary:          (auditRec.executive_summary as string | null) ?? null,
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
          is_current:                 isCurrentAudit,
          rebuild_count:              rebuildCount,
          run_stage:                  (auditRec.run_stage as "initial" | "final") ?? "initial",
        }}
        client={client}
        categories={categories}
        questionnaire={questionnaire}
        webhookLogs={webhookLogs ?? []}
        transcriptUrl={transcriptUrl}
        pdfUrl={pdfUrl}
        clientFields={(clientFields ?? []) as FieldDefinition[]}
        questionnaireFields={(questionnaireFields ?? []) as FieldDefinition[]}
        discoveryCall={(discoveryCallRaw as unknown as DiscoveryCall | null) ?? null}
        clientFollowups={(clientFollowupsRaw ?? []) as unknown as ClientFollowupRow[]}
        followupAnswers={(followupAnswersRaw ?? []) as Array<{ id: string; category_number: number | null; question_text: string; answer_text: string; submitted_at: string }>}
        siblingAudits={siblingAudits}
        proposal={(proposalRaw as { id: string; status: string } | null) ?? null}
      />
    </div>
  );
}
