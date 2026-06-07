import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendClientInviteEmail } from "@/lib/email";

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

  // Send magic link to client
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { data: magicLinkData, error: magicLinkError } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: client.email,
    options: { redirectTo: `${appUrl}/portal` },
  });

  if (!magicLinkError && magicLinkData?.properties?.hashed_token && process.env.RESEND_API_KEY) {
    const magicLink = `${appUrl}/auth/callback?token_hash=${magicLinkData.properties.hashed_token}&type=magiclink&next=/portal`;
    sendClientInviteEmail({
      to: client.email,
      businessName: client.business_name,
      ownerName: client.owner_name ?? undefined,
      magicLink,
    }).catch(() => {});
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
