import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fireInitialAuditWebhook, buildAuditEnginePayload } from "@/lib/n8n";

// POST /api/questionnaires/[audit_id]/submit
// STAFF-ONLY (gated by middleware). Used by the internal audit editor to enter
// and submit a questionnaire on the client's behalf. Saves the questionnaire,
// transitions the audit to audit_running, and fires the n8n audit engine.
// Clients use the public, token-based /api/q/[token]/submit instead.
export async function POST(
  request: NextRequest,
  { params }: { params: { audit_id: string } }
) {
  const supabase = createClient();
  const service = createServiceClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { questionnaire_data: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { questionnaire_data } = body;
  if (!questionnaire_data || typeof questionnaire_data !== "object") {
    return NextResponse.json({ error: "questionnaire_data is required" }, { status: 400 });
  }

  const { data: audit, error: auditError } = await service
    .from("audits")
    .select("id, status, client_id")
    .eq("id", params.audit_id)
    .single();

  if (auditError || !audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }
  if (audit.status !== "awaiting_questionnaire") {
    return NextResponse.json({ error: "Audit is not awaiting questionnaire" }, { status: 409 });
  }

  const now = new Date().toISOString();

  // 1. Save questionnaire (update latest row or insert)
  const { data: existingQ } = await service
    .from("questionnaires")
    .select("id")
    .eq("audit_id", params.audit_id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingQ) {
    await service
      .from("questionnaires")
      .update({ data: questionnaire_data, submitted_at: now })
      .eq("id", existingQ.id);
  } else {
    await service
      .from("questionnaires")
      .insert({ audit_id: params.audit_id, data: questionnaire_data, submitted_at: now });
  }

  // 2. Transition to audit_running (initial run)
  await service
    .from("audits")
    .update({ status: "audit_running", run_stage: "initial", questionnaire_submitted_at: now })
    .eq("id", params.audit_id);

  // 3. Fire the initial n8n audit engine
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const payload = await buildAuditEnginePayload(service, {
    auditId: params.audit_id,
    previousAuditId: params.audit_id,
    rebuildCount: 0,
    runStage: "initial",
    reviewNotes: null,
    callbackUrl: `${appUrl}/api/webhooks/audit-complete`,
  });

  if (payload) {
    fireInitialAuditWebhook(payload, params.audit_id).catch((err) =>
      console.error("[questionnaires/submit] initial-audit webhook error:", err)
    );
  }

  // 4. Audit log
  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.questionnaire_submitted",
    entity_type: "audit",
    entity_id: params.audit_id,
    metadata: { client_id: audit.client_id, source: "staff_editor" },
  });

  return NextResponse.json({ ok: true });
}
