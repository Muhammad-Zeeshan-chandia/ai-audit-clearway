import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fireSendQuestionnaireWebhook, generateMagicLink } from "@/lib/n8n";

// POST /api/clients/[id]/audits
// Creates a new audit for an existing client and sends them a magic link.
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  const { data: client, error: clientErr } = await service
    .from("clients")
    .select("id, email, business_name, owner_name")
    .eq("id", params.id)
    .is("deleted_at", null)
    .single();

  if (clientErr || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Create the audit row
  const { data: audit, error: auditErr } = await service
    .from("audits")
    .insert({
      client_id: params.id,
      status: "awaiting_questionnaire",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (auditErr || !audit) {
    return NextResponse.json({ error: auditErr?.message ?? "Failed to create audit" }, { status: 500 });
  }

  // Generate magic link and fire n8n questionnaire webhook
  const magicLink = await generateMagicLink(
    service,
    client.email,
    `/portal/questionnaire/${audit.id}`
  );

  if (magicLink) {
    fireSendQuestionnaireWebhook(
      {
        audit_id: audit.id,
        client_email: client.email,
        client_name: client.owner_name ?? null,
        business_name: client.business_name,
        magic_link: magicLink,
        is_resend: false,
      },
      audit.id
    ).catch((err) => console.error("[clients/audits] send-questionnaire webhook error:", err));
  }

  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.created",
    entity_type: "audit",
    entity_id: audit.id,
    metadata: { client_id: params.id, triggered_by: "staff" },
  });

  return NextResponse.json({ ok: true, audit_id: audit.id });
}
