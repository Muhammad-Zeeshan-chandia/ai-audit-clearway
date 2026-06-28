import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildProposalGenPayload, fireGenerateProposalWebhook } from "@/lib/n8n";

// POST /api/audits/[id]/build-proposal
// Generates (or regenerates) the proposal for a finished audit. Available once
// the final audit PDF exists. Serves both the audit page's "Build Proposal" and
// the proposal page's "Regenerate" (which passes { instructions }). The separate
// n8n workflow builds the proposal PDF and calls /api/webhooks/proposal-ready.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  const body = (await request.json().catch(() => ({}))) as { instructions?: string };
  const instructions = typeof body.instructions === "string" && body.instructions.trim()
    ? body.instructions.trim()
    : null;

  const { data: audit } = await service
    .from("audits")
    .select("id, status, pdf_path, client_id")
    .eq("id", params.id)
    .single();

  if (!audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  if (audit.status !== "final_review" && audit.status !== "sent") {
    return NextResponse.json(
      { error: "A proposal can be built once the final audit is complete." },
      { status: 409 }
    );
  }
  if (!audit.pdf_path) {
    return NextResponse.json(
      { error: "Generate the audit PDF before building a proposal." },
      { status: 409 }
    );
  }

  // One proposal per audit. Upsert: create on first build, otherwise reset to
  // generating and bump the regenerate counter.
  const { data: existing } = await service
    .from("proposals")
    .select("id, regenerate_count")
    .eq("audit_id", params.id)
    .maybeSingle();

  let proposalId: string;
  let regenerateCount: number;

  if (existing) {
    regenerateCount = (existing.regenerate_count ?? 0) + 1;
    proposalId = existing.id;
    const { error: updErr } = await service
      .from("proposals")
      .update({
        status: "generating",
        instructions,
        regenerate_count: regenerateCount,
        pdf_path: null,
        pdf_generated_at: null,
      })
      .eq("id", existing.id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  } else {
    regenerateCount = 0;
    const { data: inserted, error: insErr } = await service
      .from("proposals")
      .insert({
        audit_id: params.id,
        client_id: audit.client_id,
        status: "generating",
        instructions,
        regenerate_count: 0,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      return NextResponse.json({ error: insErr?.message ?? "Failed to create proposal" }, { status: 500 });
    }
    proposalId = inserted.id;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const payload = await buildProposalGenPayload(service, {
    auditId: params.id,
    proposalId,
    instructions,
    regenerateCount,
    callbackUrl: `${appUrl}/api/webhooks/proposal-ready`,
  });

  if (payload) {
    fireGenerateProposalWebhook(payload, params.id).catch((err) =>
      console.error("[build-proposal] webhook error:", err)
    );
  }

  await service.from("audit_log").insert({
    actor_id: user.id,
    action: existing ? "proposal.regeneration_requested" : "proposal.generation_requested",
    entity_type: "proposal",
    entity_id: proposalId,
    metadata: { audit_id: params.id, regenerate_count: regenerateCount },
  });

  return NextResponse.json({ ok: true, proposal_id: proposalId });
}
