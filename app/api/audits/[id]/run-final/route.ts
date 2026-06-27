import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fireFinalAuditWebhook, buildAuditEnginePayload } from "@/lib/n8n";

// POST /api/audits/[id]/run-final
// Triggers the final audit run (full context incl. the client's answers).
// Available once the client's answers have been received.
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
    .select("id, status")
    .eq("id", params.id)
    .single();

  if (!audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  if (audit.status !== "answers_received") {
    return NextResponse.json(
      { error: "The final audit can only run after the client's answers are received." },
      { status: 409 }
    );
  }

  await service
    .from("audits")
    .update({ status: "audit_running", run_stage: "final" })
    .eq("id", params.id);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const payload = await buildAuditEnginePayload(service, {
    auditId: params.id,
    previousAuditId: params.id,
    rebuildCount: 1,
    runStage: "final",
    reviewNotes: null,
    callbackUrl: `${appUrl}/api/webhooks/audit-complete`,
  });

  if (payload) {
    fireFinalAuditWebhook(payload, params.id).catch((err) =>
      console.error("[run-final] final-audit webhook error:", err)
    );
  }

  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.final_run_started",
    entity_type: "audit",
    entity_id: params.id,
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
