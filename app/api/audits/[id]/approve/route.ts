import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fireSendAuditWebhook } from "@/lib/n8n";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  // Load audit + client email
  const { data: audit, error: auditErr } = await service
    .from("audits")
    .select("id, status, pdf_path, clients(id, email, business_name)")
    .eq("id", params.id)
    .single();

  if (auditErr || !audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  if (audit.status !== "awaiting_review") {
    return NextResponse.json({ error: "Audit is not awaiting review" }, { status: 409 });
  }

  type ClientShape = { id: string; email: string; business_name: string };
  const rawClient = audit.clients as ClientShape[] | null;
  const client = (Array.isArray(rawClient) ? rawClient[0] : rawClient as unknown as ClientShape | null);

  const now = new Date().toISOString();

  // 1. Update audit
  await service.from("audits").update({
    status: "sent",
    reviewed_by: user.id,
    reviewed_at: now,
    sent_at: now,
  }).eq("id", params.id);

  // 2. Fire send webhook to n8n (n8n emails the client)
  if (client) {
    fireSendAuditWebhook(
      { audit_id: params.id, client_email: client.email, pdf_path: audit.pdf_path as string | null },
      params.id
    ).catch((err) => console.error("[approve] send webhook error:", err));
  }

  // 3. Audit log
  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.approved_and_sent",
    entity_type: "audit",
    entity_id: params.id,
    metadata: { client_email: client?.email },
  });

  return NextResponse.json({ ok: true });
}
