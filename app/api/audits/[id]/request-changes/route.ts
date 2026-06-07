import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fireRerunAuditWebhook } from "@/lib/n8n";

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

  const { data: audit, error: auditErr } = await service
    .from("audits")
    .select("id, status, client_id")
    .eq("id", params.id)
    .single();

  if (auditErr || !audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  if (audit.status !== "awaiting_review") {
    return NextResponse.json({ error: "Audit is not awaiting review" }, { status: 409 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // 1. Update audit back to running with review notes
  await service.from("audits").update({
    status: "audit_running",
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    review_notes: review_notes.trim(),
  }).eq("id", params.id);

  // 2. Fire re-run webhook
  fireRerunAuditWebhook(
    {
      audit_id: params.id,
      client_id: audit.client_id,
      review_notes: review_notes.trim(),
      callback_url: `${appUrl}/api/webhooks/audit-complete`,
    },
    params.id
  ).catch((err) => console.error("[request-changes] rerun webhook error:", err));

  // 3. Audit log
  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.changes_requested",
    entity_type: "audit",
    entity_id: params.id,
    metadata: { review_notes: review_notes.trim() },
  });

  return NextResponse.json({ ok: true });
}
