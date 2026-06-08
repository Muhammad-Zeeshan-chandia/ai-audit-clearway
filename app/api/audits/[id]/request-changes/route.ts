import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fireRerunAuditWebhook, buildAuditEnginePayload } from "@/lib/n8n";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { review_notes } = await request.json() as { review_notes: string };
  if (!review_notes?.trim()) {
    return NextResponse.json({ error: "review_notes are required" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: oldAudit, error: oldErr } = await service
    .from("audits")
    .select("id, status, client_id, transcript_path, rebuild_count, is_current")
    .eq("id", params.id)
    .single();

  if (oldErr || !oldAudit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  if (!["awaiting_review", "followup_received"].includes(oldAudit.status)) {
    return NextResponse.json(
      { error: `Cannot request changes from status "${oldAudit.status}"` },
      { status: 409 }
    );
  }

  if (!oldAudit.is_current) {
    return NextResponse.json({ error: "Cannot rebuild an archived audit" }, { status: 409 });
  }

  const now = new Date().toISOString();

  // 1. Archive old audit
  await service.from("audits").update({
    status: "archived",
    is_current: false,
    reviewed_by: user.id,
    reviewed_at: now,
    review_notes: review_notes.trim(),
  }).eq("id", params.id);

  // 2. Insert new audit row (carries client_id + transcript)
  const { data: newAudit, error: insertErr } = await service.from("audits").insert({
    client_id: oldAudit.client_id,
    status: "audit_running",
    transcript_path: oldAudit.transcript_path,
    is_current: true,
    rebuild_count: (oldAudit.rebuild_count ?? 0) + 1,
    created_by: user.id,
    questionnaire_submitted_at: now,
  }).select("id").single();

  if (insertErr || !newAudit) {
    // Roll back the archive
    await service.from("audits").update({
      status: oldAudit.status,
      is_current: true,
      review_notes: null,
    }).eq("id", params.id);
    return NextResponse.json({ error: insertErr?.message ?? "Failed to create new audit" }, { status: 500 });
  }

  // 3. Carry forward questionnaire data (most recent row of old audit)
  const { data: latestQ } = await service
    .from("questionnaires")
    .select("data")
    .eq("audit_id", params.id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestQ) {
    await service.from("questionnaires").insert({
      audit_id: newAudit.id,
      data: latestQ.data,
      submitted_at: now,
    });
  }

  // 4. Carry forward discovery_call (if any)
  const { data: oldDiscovery } = await service
    .from("discovery_calls")
    .select("*")
    .eq("audit_id", params.id)
    .maybeSingle();

  if (oldDiscovery) {
    const dcCopy = {
      ...oldDiscovery,
      audit_id: newAudit.id,
    } as Record<string, unknown>;
    delete dcCopy.id;
    delete dcCopy.created_at;
    await service.from("discovery_calls").insert(dcCopy);
  }

  // 5. Build engine payload + fire rebuild webhook
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const payload = await buildAuditEnginePayload(service, {
    auditId: newAudit.id,
    previousAuditId: params.id,
    rebuildCount: (oldAudit.rebuild_count ?? 0) + 1,
    reviewNotes: review_notes.trim(),
    callbackUrl: `${appUrl}/api/webhooks/audit-complete`,
  });

  if (payload) {
    fireRerunAuditWebhook(payload, newAudit.id).catch((err) =>
      console.error("[request-changes] rerun webhook error:", err)
    );
  }

  // 6. Audit log
  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.rebuild_requested",
    entity_type: "audit",
    entity_id: newAudit.id,
    metadata: {
      previous_audit_id: params.id,
      review_notes: review_notes.trim(),
      rebuild_count: (oldAudit.rebuild_count ?? 0) + 1,
    },
  });

  return NextResponse.json({ ok: true, new_audit_id: newAudit.id });
}
