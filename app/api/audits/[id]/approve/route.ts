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

  const { data: audit, error: auditErr } = await service
    .from("audits")
    .select(`
      id, status, pdf_path, executive_summary, final_tier, total_opportunity_gbp,
      clients(id, email, business_name, owner_name)
    `)
    .eq("id", params.id)
    .single();

  if (auditErr || !audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });

  // Allow approve from any review-ready status
  if (!["awaiting_review", "followup_received", "approved"].includes(audit.status)) {
    return NextResponse.json(
      { error: "Audit cannot be approved from its current status" },
      { status: 409 }
    );
  }

  type ClientShape = { id: string; email: string; business_name: string; owner_name: string | null };
  const rawClient = audit.clients as ClientShape[] | null;
  const client = Array.isArray(rawClient) ? rawClient[0] : (rawClient as unknown as ClientShape | null);

  const now = new Date().toISOString();

  await service.from("audits").update({
    status: "sent",
    reviewed_by: user.id,
    reviewed_at: now,
    sent_at: now,
  }).eq("id", params.id);

  if (client) {
    fireSendAuditWebhook(
      {
        audit_id: params.id,
        client_email: client.email,
        client_name: client.owner_name ?? null,
        business_name: client.business_name,
        pdf_path: audit.pdf_path as string | null,
        executive_summary: (audit as Record<string, unknown>).executive_summary as string | null,
        final_tier: (audit as Record<string, unknown>).final_tier as string | null,
        total_opportunity_gbp:
          (audit as Record<string, unknown>).total_opportunity_gbp != null
            ? Number((audit as Record<string, unknown>).total_opportunity_gbp)
            : null,
      },
      params.id
    ).catch((err) => console.error("[approve] send webhook error:", err));
  }

  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.approved_and_sent",
    entity_type: "audit",
    entity_id: params.id,
    metadata: { client_email: client?.email },
  });

  return NextResponse.json({ ok: true });
}
