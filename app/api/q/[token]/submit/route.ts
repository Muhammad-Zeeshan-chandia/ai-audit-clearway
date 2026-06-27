import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fireRunAuditWebhook, buildAuditEnginePayload } from "@/lib/n8n";

// POST /api/q/[token]/submit
// Public — the access token is the credential. Saves the questionnaire,
// transitions the audit to audit_running, and fires the n8n audit engine.
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const service = createServiceClient();

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

  // Resolve audit by access token
  const { data: audit } = await service
    .from("audits")
    .select("id, status, is_current, client_id")
    .eq("access_token", params.token)
    .maybeSingle();

  if (!audit) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }
  if (!audit.is_current) {
    return NextResponse.json({ error: "This audit is no longer active" }, { status: 409 });
  }
  if (audit.status !== "awaiting_questionnaire") {
    return NextResponse.json({ error: "Questionnaire already submitted" }, { status: 409 });
  }

  const now = new Date().toISOString();

  // 1. Save questionnaire (update latest row or insert)
  const { data: existingQ } = await service
    .from("questionnaires")
    .select("id")
    .eq("audit_id", audit.id)
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
      .insert({ audit_id: audit.id, data: questionnaire_data, submitted_at: now });
  }

  // 2. Transition to audit_running
  await service
    .from("audits")
    .update({ status: "audit_running", questionnaire_submitted_at: now })
    .eq("id", audit.id);

  // 3. Fire the n8n audit engine
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const payload = await buildAuditEnginePayload(service, {
    auditId: audit.id,
    previousAuditId: audit.id,
    rebuildCount: 0,
    reviewNotes: null,
    callbackUrl: `${appUrl}/api/webhooks/audit-complete`,
  });

  if (payload) {
    fireRunAuditWebhook(payload, audit.id).catch((err) =>
      console.error("[q/submit] run-audit webhook error:", err)
    );
  }

  // 4. Audit log
  await service.from("audit_log").insert({
    actor_id: null,
    action: "audit.questionnaire_submitted",
    entity_type: "audit",
    entity_id: audit.id,
    metadata: { client_id: audit.client_id, source: "public_link" },
  });

  return NextResponse.json({ ok: true });
}
