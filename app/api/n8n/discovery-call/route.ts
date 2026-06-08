import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifySignature } from "@/lib/n8n";

interface DiscoveryCallPayload {
  client_id: string;
  notes: string;
  call_date?: string;   // ISO date string
  called_by?: string;   // staff name or ID
}

// POST /api/n8n/discovery-call
// Inbound from n8n — persists a discovery call and creates/activates the audit.
// HMAC-protected (excluded from session auth by middleware).
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const signature = request.headers.get("X-Clearway-Signature") ?? "";
  if (process.env.N8N_WEBHOOK_SECRET && !verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: DiscoveryCallPayload;
  try {
    payload = JSON.parse(rawBody) as DiscoveryCallPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.client_id || !payload.notes) {
    return NextResponse.json({ error: "client_id and notes are required" }, { status: 400 });
  }

  const service = createServiceClient();

  // Find the current awaiting_questionnaire audit for this client
  const { data: existingAudit } = await service
    .from("audits")
    .select("id")
    .eq("client_id", payload.client_id)
    .eq("status", "awaiting_questionnaire")
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let auditId: string;

  if (existingAudit) {
    auditId = existingAudit.id;
  } else {
    // No pending audit — create one
    const { data: newAudit, error: auditErr } = await service
      .from("audits")
      .insert({
        client_id: payload.client_id,
        status: "awaiting_questionnaire",
        is_current: true,
      })
      .select("id")
      .single();

    if (auditErr || !newAudit) {
      return NextResponse.json({ error: auditErr?.message ?? "Failed to create audit" }, { status: 500 });
    }
    auditId = newAudit.id;
  }

  // Persist the discovery call
  const { error: callErr } = await service.from("discovery_calls").insert({
    audit_id: auditId,
    notes: payload.notes,
    call_date: payload.call_date ?? null,
    called_by: payload.called_by ?? null,
  });

  if (callErr) {
    return NextResponse.json({ error: callErr.message }, { status: 500 });
  }

  await service.from("audit_log").insert({
    actor_id: null,
    action: "audit.discovery_call_received",
    entity_type: "audit",
    entity_id: auditId,
    metadata: { client_id: payload.client_id, call_date: payload.call_date ?? null },
  });

  // Notify staff
  const { data: staffUsers } = await service
    .from("users")
    .select("id")
    .in("role", ["admin", "staff"]);

  if ((staffUsers ?? []).length > 0) {
    await service.from("notifications").insert(
      (staffUsers ?? []).map((u) => ({
        user_id: u.id,
        type: "discovery_call_received",
        title: "Discovery call logged",
        body: `A discovery call has been recorded for audit ${auditId}.`,
        link: `/audits/${auditId}`,
      }))
    );
  }

  return NextResponse.json({ ok: true, audit_id: auditId });
}
