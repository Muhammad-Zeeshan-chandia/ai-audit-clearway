import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const { data: audit, error } = await supabase
    .from("audits")
    .select(`
      *,
      clients(id, business_name, owner_name, email, sector, phone, website_url, shay_notes),
      audit_categories(*)
    `)
    .eq("id", params.id)
    .single();

  if (error || !audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // Questionnaire data
  const { data: questionnaire } = await supabase
    .from("questionnaires")
    .select("*")
    .eq("audit_id", params.id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Webhook logs
  const { data: webhookLogs } = await supabase
    .from("webhook_logs")
    .select("*")
    .eq("audit_id", params.id)
    .order("created_at", { ascending: false });

  // Audit log
  const { data: auditLog } = await supabase
    .from("audit_log")
    .select("*")
    .eq("entity_id", params.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Signed URL for transcript (valid 5 min)
  let transcriptUrl: string | null = null;
  if (audit.transcript_path) {
    const { data: signed } = await createServiceClient().storage
      .from("transcripts")
      .createSignedUrl(audit.transcript_path, 300);
    transcriptUrl = signed?.signedUrl ?? null;
  }

  // Signed URL for PDF (valid 5 min)
  let pdfUrl: string | null = null;
  if (audit.pdf_path) {
    const { data: signed } = await createServiceClient().storage
      .from("pdfs")
      .createSignedUrl(audit.pdf_path, 300);
    pdfUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({
    audit,
    questionnaire,
    webhookLogs: webhookLogs ?? [],
    auditLog: auditLog ?? [],
    transcriptUrl,
    pdfUrl,
  });
}
