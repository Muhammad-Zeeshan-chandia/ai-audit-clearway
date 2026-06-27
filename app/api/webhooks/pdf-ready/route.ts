import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifySignature } from "@/lib/n8n";

// POST /api/webhooks/pdf-ready
// Inbound from the n8n PDF-generation workflow once the PDF is built + stored.
// Records the pdf_path on the audit so the dashboard reflects "PDF ready" and
// Approve & Send becomes available. HMAC-protected (X-Clearway-Signature).
interface PdfReadyPayload {
  audit_id: string;
  pdf_path: string;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const signature = request.headers.get("X-Clearway-Signature") ?? "";
  if (process.env.N8N_WEBHOOK_SECRET && !verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: PdfReadyPayload;
  try {
    payload = JSON.parse(rawBody) as PdfReadyPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.audit_id || !payload.pdf_path) {
    return NextResponse.json({ error: "audit_id and pdf_path are required" }, { status: 422 });
  }

  const service = createServiceClient();

  await service.from("webhook_logs").insert({
    direction: "incoming",
    endpoint: "/api/webhooks/pdf-ready",
    payload,
    response_status: 200,
    response_body: "accepted",
    audit_id: payload.audit_id,
  });

  const { data: audit } = await service
    .from("audits")
    .select("id, client_id")
    .eq("id", payload.audit_id)
    .single();

  if (!audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });

  const { error: updateError } = await service
    .from("audits")
    .update({ pdf_path: payload.pdf_path, pdf_generated_at: new Date().toISOString() })
    .eq("id", payload.audit_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await service.from("audit_log").insert({
    actor_id: null,
    action: "audit.pdf_ready",
    entity_type: "audit",
    entity_id: payload.audit_id,
    metadata: { pdf_path: payload.pdf_path },
  });

  // Notify staff the PDF is ready to approve & send.
  const { data: staffUsers } = await service.from("users").select("id").in("role", ["admin", "staff"]);
  const { data: auditWithClient } = await service
    .from("audits")
    .select("clients(business_name)")
    .eq("id", payload.audit_id)
    .single();
  const rawClients = auditWithClient?.clients as Array<{ business_name: string }> | { business_name: string } | null;
  const businessName = (Array.isArray(rawClients) ? rawClients[0] : rawClients)?.business_name ?? "Unknown business";

  if ((staffUsers ?? []).length > 0) {
    await service.from("notifications").insert(
      (staffUsers ?? []).map((u) => ({
        user_id: u.id,
        type: "pdf_ready",
        title: `PDF ready — ${businessName}`,
        body: `The audit PDF for ${businessName} is ready to approve & send.`,
        link: `/audits/${payload.audit_id}`,
      }))
    );
  }

  return NextResponse.json({ ok: true });
}
