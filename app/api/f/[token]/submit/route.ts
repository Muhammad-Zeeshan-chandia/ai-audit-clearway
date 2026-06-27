import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// POST /api/f/[token]/submit
// Public — the access token is the credential. Saves a client follow-up
// response and transitions the audit to followup_received.
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const body = (await request.json().catch(() => ({}))) as { response_text?: string };
  if (!body.response_text?.trim()) {
    return NextResponse.json({ error: "response_text is required" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: audit } = await service
    .from("audits")
    .select("id, status, is_current, client_id, clients(business_name)")
    .eq("access_token", params.token)
    .maybeSingle();

  if (!audit) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (!audit.is_current) {
    return NextResponse.json({ error: "This audit is no longer active" }, { status: 409 });
  }
  if (audit.status !== "awaiting_client_followup") {
    return NextResponse.json({ error: "Audit is not awaiting a follow-up" }, { status: 409 });
  }

  type ClientShape = { business_name: string };
  const rawClient = audit.clients as ClientShape[] | ClientShape | null;
  const client = Array.isArray(rawClient) ? rawClient[0] : rawClient;
  const businessName = client?.business_name ?? "Client";

  await service.from("client_followups").insert({
    audit_id: audit.id,
    response_text: body.response_text.trim(),
    source: "email_form",
  });

  await service.from("audits").update({ status: "followup_received" }).eq("id", audit.id);

  // Notify staff
  const { data: staffUsers } = await service
    .from("users")
    .select("id")
    .in("role", ["admin", "staff"]);

  if ((staffUsers ?? []).length > 0) {
    await service.from("notifications").insert(
      (staffUsers ?? []).map((u) => ({
        user_id: u.id,
        type: "followup_received",
        title: `Follow-up received — ${businessName}`,
        body: `A client follow-up response has been submitted for the ${businessName} audit.`,
        link: `/audits/${audit.id}?tab=review`,
      }))
    );
  }

  await service.from("audit_log").insert({
    actor_id: null,
    action: "audit.followup_submitted",
    entity_type: "audit",
    entity_id: audit.id,
    metadata: { source: "public_link" },
  });

  return NextResponse.json({ ok: true });
}
