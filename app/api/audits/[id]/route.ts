import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { TIERS } from "@/lib/constants/categories";

// PATCH /api/audits/[id]
// Accepts: { final_tier?, tier_overridden?, executive_summary?, review_notes? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    final_tier?: string;
    tier_overridden?: boolean;
    executive_summary?: string;
    review_notes?: string;
  };

  if (body.final_tier && !TIERS.includes(body.final_tier as typeof TIERS[number])) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.final_tier !== undefined)       update.final_tier = body.final_tier;
  if (body.tier_overridden !== undefined)  update.tier_overridden = body.tier_overridden;
  if (body.executive_summary !== undefined) update.executive_summary = body.executive_summary;
  if (body.review_notes !== undefined)     update.review_notes = body.review_notes;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.from("audits").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.updated",
    entity_type: "audit",
    entity_id: params.id,
    metadata: { fields: Object.keys(update) },
  });

  return NextResponse.json({ ok: true });
}

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
