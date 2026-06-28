import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifySignature } from "@/lib/n8n";

// POST /api/webhooks/proposal-ready
// Inbound from the n8n proposal-generation workflow once the proposal PDF is
// built + stored. Records the pdf_path on the proposal so the dashboard reflects
// "ready". HMAC-protected (X-Clearway-Signature). Resolve the proposal by
// proposal_id (preferred) or audit_id.
interface ProposalReadyPayload {
  proposal_id?: string;
  audit_id?: string;
  pdf_path: string;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const signature = request.headers.get("X-Clearway-Signature") ?? "";
  if (process.env.N8N_WEBHOOK_SECRET && !verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: ProposalReadyPayload;
  try {
    payload = JSON.parse(rawBody) as ProposalReadyPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if ((!payload.proposal_id && !payload.audit_id) || !payload.pdf_path) {
    return NextResponse.json(
      { error: "pdf_path and one of proposal_id / audit_id are required" },
      { status: 422 }
    );
  }

  const service = createServiceClient();

  // Resolve the proposal.
  const query = service.from("proposals").select("id, audit_id, client_id");
  const { data: proposal } = await (payload.proposal_id
    ? query.eq("id", payload.proposal_id)
    : query.eq("audit_id", payload.audit_id as string)
  ).maybeSingle();

  await service.from("webhook_logs").insert({
    direction: "incoming",
    endpoint: "/api/webhooks/proposal-ready",
    payload,
    response_status: proposal ? 200 : 404,
    response_body: proposal ? "accepted" : "proposal not found",
    audit_id: proposal?.audit_id ?? payload.audit_id ?? null,
  });

  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  const { error: updateError } = await service
    .from("proposals")
    .update({
      pdf_path: payload.pdf_path,
      pdf_generated_at: new Date().toISOString(),
      status: "ready",
    })
    .eq("id", proposal.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await service.from("audit_log").insert({
    actor_id: null,
    action: "proposal.ready",
    entity_type: "proposal",
    entity_id: proposal.id,
    metadata: { pdf_path: payload.pdf_path, audit_id: proposal.audit_id },
  });

  // Notify staff the proposal is ready to review & send.
  const { data: client } = await service
    .from("clients")
    .select("business_name")
    .eq("id", proposal.client_id)
    .single();
  const businessName = client?.business_name ?? "Unknown business";

  const { data: staffUsers } = await service.from("users").select("id").in("role", ["admin", "staff"]);
  if ((staffUsers ?? []).length > 0) {
    await service.from("notifications").insert(
      (staffUsers ?? []).map((u) => ({
        user_id: u.id,
        type: "proposal_ready",
        title: `Proposal ready — ${businessName}`,
        body: `The proposal for ${businessName} is ready to review & send.`,
        link: `/proposals/${proposal.id}`,
      }))
    );
  }

  return NextResponse.json({ ok: true });
}
