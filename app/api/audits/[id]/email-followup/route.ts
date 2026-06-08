import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fireEmailFollowupWebhook, generateMagicLink } from "@/lib/n8n";

// POST /api/audits/[id]/email-followup
// Staff requests additional information from the client.
// Transitions audit to awaiting_client_followup and fires n8n to deliver the email.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { review_notes?: string };

  const service = createServiceClient();

  const { data: audit } = await service
    .from("audits")
    .select("id, status, client_id, clients(id, email, business_name, owner_name)")
    .eq("id", params.id)
    .single();

  if (!audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  if (!["awaiting_review", "awaiting_client_followup"].includes(audit.status)) {
    return NextResponse.json({ error: "Audit is not in a reviewable state" }, { status: 409 });
  }

  type ClientShape = { id: string; email: string; business_name: string; owner_name: string | null };
  const rawClient = audit.clients as ClientShape[] | null;
  const client = Array.isArray(rawClient) ? rawClient[0] : (rawClient as unknown as ClientShape | null);

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const reviewNotes = body.review_notes?.trim() || null;

  await service
    .from("audits")
    .update({ status: "awaiting_client_followup", review_notes: reviewNotes })
    .eq("id", params.id);

  const magicLink = await generateMagicLink(
    service,
    client.email,
    `/portal/followup/${params.id}`
  );

  if (magicLink) {
    fireEmailFollowupWebhook(
      {
        audit_id: params.id,
        client_email: client.email,
        client_name: client.owner_name,
        business_name: client.business_name,
        magic_link: magicLink,
        review_notes: reviewNotes,
      },
      params.id
    ).catch((err) => console.error("[email-followup] webhook error:", err));
  }

  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.followup_requested",
    entity_type: "audit",
    entity_id: params.id,
    metadata: { magic_link_generated: Boolean(magicLink), has_review_notes: Boolean(reviewNotes) },
  });

  return NextResponse.json({ ok: true });
}
