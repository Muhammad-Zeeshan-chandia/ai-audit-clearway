import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fireSendProposalWebhook } from "@/lib/n8n";

// POST /api/proposals/[id]/send
// Emails the proposal PDF to the client via n8n. Available once the proposal
// PDF is ready; after sending, the same action re-sends it.
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  const { data: proposal, error: propErr } = await service
    .from("proposals")
    .select("id, audit_id, status, pdf_path, clients(email, business_name, owner_name)")
    .eq("id", params.id)
    .single();

  if (propErr || !proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  const isResend = proposal.status === "sent";
  if (proposal.status !== "ready" && !isResend) {
    return NextResponse.json(
      { error: "The proposal must be ready before sending." },
      { status: 409 }
    );
  }
  if (!proposal.pdf_path) {
    return NextResponse.json({ error: "The proposal PDF is not ready yet." }, { status: 409 });
  }

  type ClientShape = { email: string; business_name: string; owner_name: string | null };
  const rawClient = proposal.clients as ClientShape[] | ClientShape | null;
  const client = Array.isArray(rawClient) ? rawClient[0] : rawClient;

  const now = new Date().toISOString();
  await service.from("proposals").update({ status: "sent", sent_at: now }).eq("id", params.id);

  // Sign the proposal PDF so n8n can attach it. Stored with the bucket name in
  // the path ("pdfs/…"); strip it so the signed URL resolves.
  const pdfPath = proposal.pdf_path as string;
  const key = pdfPath.replace(/^pdfs\//, "");
  const { data: signed } = await service.storage.from("pdfs").createSignedUrl(key, 600);

  if (client) {
    fireSendProposalWebhook(
      {
        proposal_id: params.id,
        audit_id: proposal.audit_id as string,
        client_email: client.email,
        client_name: client.owner_name ?? null,
        business_name: client.business_name,
        proposal_pdf_path: pdfPath,
        proposal_pdf_url: signed?.signedUrl ?? null,
      },
      proposal.audit_id as string
    ).catch((err) => console.error("[proposal send] webhook error:", err));
  }

  await service.from("audit_log").insert({
    actor_id: user.id,
    action: isResend ? "proposal.resent" : "proposal.sent",
    entity_type: "proposal",
    entity_id: params.id,
    metadata: { audit_id: proposal.audit_id, client_email: client?.email },
  });

  return NextResponse.json({ ok: true });
}
