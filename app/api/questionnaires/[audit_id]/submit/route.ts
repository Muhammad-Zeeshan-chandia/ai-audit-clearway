import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fireRunAuditWebhook } from "@/lib/n8n";

export async function POST(
  request: NextRequest,
  { params }: { params: { audit_id: string } }
) {
  const supabase = createClient();
  const service = createServiceClient();

  // Verify authenticated client
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { questionnaire_data: Record<string, unknown>; client_meta: { business_name: string; sector: string | null; owner_name: string | null } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { questionnaire_data, client_meta } = body;

  // Load audit + verify ownership
  const { data: audit, error: auditError } = await service
    .from("audits")
    .select("id, status, client_id, transcript_path, clients(id, email, website_url)")
    .eq("id", params.audit_id)
    .single();

  if (auditError || !audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  type ClientShape = { id: string; email: string; website_url: string | null };
  const rawClients = audit.clients as ClientShape[] | null;
  const clientData = (Array.isArray(rawClients) ? rawClients[0] : rawClients as unknown as ClientShape | null);

  if (!clientData || clientData.email.toLowerCase() !== user.email!.toLowerCase()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (audit.status !== "awaiting_questionnaire") {
    return NextResponse.json({ error: "Audit is not awaiting questionnaire" }, { status: 409 });
  }

  const now = new Date().toISOString();

  // 1. Save final questionnaire data — find existing row and update, or insert new
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

  // 2. Update audit status → audit_running
  await service
    .from("audits")
    .update({
      status: "audit_running",
      questionnaire_submitted_at: now,
    })
    .eq("id", params.audit_id);

  // 3. Fire n8n webhook (async — don't block the response on failure)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  fireRunAuditWebhook(
    {
      audit_id: params.audit_id,
      client_id: audit.client_id,
      transcript_path: audit.transcript_path as string | null,
      website_url: clientData.website_url,
      questionnaire: questionnaire_data,
      client_meta,
      callback_url: `${appUrl}/api/webhooks/audit-complete`,
    },
    params.audit_id
  ).catch((err) => console.error("[n8n] webhook error:", err));

  // 4. Audit log
  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.questionnaire_submitted",
    entity_type: "audit",
    entity_id: params.audit_id,
    metadata: { client_id: audit.client_id },
  });

  return NextResponse.json({ ok: true });
}
