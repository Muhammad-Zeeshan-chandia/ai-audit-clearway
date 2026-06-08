import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// POST /api/followups/[audit_id]/submit
// Client submits a follow-up response from the portal.
// Session-auth protected (client must be signed in via magic link).
export async function POST(
  request: NextRequest,
  { params }: { params: { audit_id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { response_text?: string };
  if (!body.response_text?.trim()) {
    return NextResponse.json({ error: "response_text is required" }, { status: 400 });
  }

  const service = createServiceClient();

  // Load audit + client to verify ownership
  const { data: audit } = await service
    .from("audits")
    .select("id, status, client_id, clients(id, email, business_name)")
    .eq("id", params.audit_id)
    .single();

  if (!audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });

  type ClientShape = { id: string; email: string; business_name: string };
  const rawClient = audit.clients as ClientShape[] | null;
  const client = Array.isArray(rawClient) ? rawClient[0] : (rawClient as unknown as ClientShape | null);

  if (!client || client.email.toLowerCase() !== user.email!.toLowerCase()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (audit.status !== "awaiting_client_followup") {
    return NextResponse.json({ error: "Audit is not awaiting a follow-up" }, { status: 409 });
  }

  // Persist the follow-up response
  await service.from("client_followups").insert({
    audit_id: params.audit_id,
    response_text: body.response_text.trim(),
    source: "email_form",
  });

  // Transition audit status
  await service
    .from("audits")
    .update({ status: "followup_received" })
    .eq("id", params.audit_id);

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
        title: `Follow-up received — ${client.business_name}`,
        body: `A client follow-up response has been submitted for the ${client.business_name} audit.`,
        link: `/audits/${params.audit_id}?tab=review`,
      }))
    );
  }

  await service.from("audit_log").insert({
    actor_id: null,
    action: "audit.followup_submitted",
    entity_type: "audit",
    entity_id: params.audit_id,
    metadata: { source: "email_form" },
  });

  return NextResponse.json({ ok: true });
}
