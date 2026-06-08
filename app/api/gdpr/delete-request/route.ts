/**
 * POST /api/gdpr/delete-request
 *
 * Creates a GDPR deletion request with a 7-day grace period.
 * Can be submitted by:
 *   - A client (for their own data, via the portal)
 *   - A staff/admin member (on behalf of a client)
 *
 * On creation: sends a deletion confirmation email to the client.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fireDeletionConfirmationWebhook } from "@/lib/n8n";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { client_id?: string };
  const service = createServiceClient();

  // Determine which client this request is for
  let clientId: string | null = body.client_id ?? null;
  let clientEmail: string;
  let clientName: string | null;

  const { data: profile } = await service
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role;

  if (role === "client") {
    // Client can only request deletion of their own data
    const { data: clientRecord } = await service
      .from("clients")
      .select("id, email, owner_name")
      .eq("email", user.email!)
      .is("deleted_at", null)
      .maybeSingle();

    if (!clientRecord) {
      return NextResponse.json({ error: "No client record found for this account." }, { status: 404 });
    }

    clientId = clientRecord.id;
    clientEmail = clientRecord.email;
    clientName = clientRecord.owner_name;
  } else if (role === "admin" || role === "staff") {
    // Staff must provide a client_id
    if (!clientId) {
      return NextResponse.json({ error: "client_id is required." }, { status: 400 });
    }

    const { data: clientRecord } = await service
      .from("clients")
      .select("id, email, owner_name")
      .eq("id", clientId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!clientRecord) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }

    clientEmail = clientRecord.email;
    clientName = clientRecord.owner_name;
  } else {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Check for an existing pending request
  const { data: existing } = await service
    .from("gdpr_deletion_requests")
    .select("id, grace_ends_at")
    .eq("client_id", clientId!)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      error: `A deletion request already exists. Data will be deleted on ${new Date(existing.grace_ends_at).toLocaleDateString("en-GB")}.`,
    }, { status: 409 });
  }

  // Create the deletion request
  const graceEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: deletionReq, error: insertErr } = await service
    .from("gdpr_deletion_requests")
    .insert({
      client_id: clientId!,
      requested_by: role === "client" ? null : user.id,
      grace_ends_at: graceEndsAt,
    })
    .select("id")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Fire deletion confirmation webhook (n8n delivers the email)
  fireDeletionConfirmationWebhook(
    { client_email: clientEmail, client_name: clientName, grace_ends_at: graceEndsAt },
    null
  ).catch(() => {});

  // Audit log
  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "gdpr.deletion_requested",
    entity_type: "client",
    entity_id: clientId!,
    metadata: { request_id: deletionReq.id, grace_ends_at: graceEndsAt },
  });

  return NextResponse.json({
    ok: true,
    grace_ends_at: graceEndsAt,
    message: `Deletion request submitted. All data will be permanently deleted on ${new Date(graceEndsAt).toLocaleDateString("en-GB")}.`,
  }, { status: 201 });
}
