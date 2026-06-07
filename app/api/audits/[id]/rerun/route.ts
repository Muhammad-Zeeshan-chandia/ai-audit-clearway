import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fireRerunAuditWebhook } from "@/lib/n8n";

// POST /api/audits/[id]/rerun
// Like request-changes but review_notes is optional — used when staff edits questionnaire
// and wants fresh AI output without specific feedback.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { review_notes?: string };
  const review_notes = (body.review_notes ?? "").trim();

  const service = createServiceClient();

  const { data: audit, error: auditErr } = await service
    .from("audits")
    .select("id, status, client_id")
    .eq("id", params.id)
    .single();

  if (auditErr || !audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  await service.from("audits").update({
    status: "audit_running",
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    ...(review_notes ? { review_notes } : {}),
  }).eq("id", params.id);

  fireRerunAuditWebhook(
    {
      audit_id: params.id,
      client_id: audit.client_id,
      review_notes,
      callback_url: `${appUrl}/api/webhooks/audit-complete`,
    },
    params.id
  ).catch((err) => console.error("[rerun] webhook error:", err));

  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.rerun_requested",
    entity_type: "audit",
    entity_id: params.id,
    metadata: { review_notes: review_notes || null },
  });

  return NextResponse.json({ ok: true });
}
