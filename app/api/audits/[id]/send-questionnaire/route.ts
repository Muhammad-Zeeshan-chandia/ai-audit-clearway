import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fireSendQuestionnaireWebhook, clientQuestionnaireUrl } from "@/lib/n8n";

// POST /api/audits/[id]/send-questionnaire
// Staff re-sends the questionnaire email to the client.
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  const { data: audit } = await service
    .from("audits")
    .select("id, status, client_id, access_token, clients(id, email, business_name, owner_name)")
    .eq("id", params.id)
    .single();

  if (!audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  if (audit.status !== "awaiting_questionnaire") {
    return NextResponse.json({ error: "Audit is not awaiting questionnaire" }, { status: 409 });
  }

  type ClientShape = { id: string; email: string; business_name: string; owner_name: string | null };
  const rawClient = audit.clients as ClientShape[] | null;
  const client = Array.isArray(rawClient) ? rawClient[0] : (rawClient as unknown as ClientShape | null);

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  fireSendQuestionnaireWebhook(
    {
      audit_id: params.id,
      client_email: client.email,
      client_name: client.owner_name,
      business_name: client.business_name,
      magic_link: clientQuestionnaireUrl(audit.access_token as string),
      is_resend: true,
    },
    params.id
  ).catch((err) => console.error("[send-questionnaire] webhook error:", err));

  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.questionnaire_resent",
    entity_type: "audit",
    entity_id: params.id,
    metadata: { invite_sent: true },
  });

  return NextResponse.json({ ok: true });
}
