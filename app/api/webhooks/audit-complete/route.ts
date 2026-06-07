import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifySignature } from "@/lib/n8n";
import { sendStaffAuditReadyEmail } from "@/lib/email";

interface CategoryPayload {
  category_number: number;
  category_name: string;
  score: number;
  rag: "RED" | "AMBER" | "GREEN";
  confidence: number;
  gbp_impact_annual: number;
  gbp_calculation: string;
  evidence: string;
  solution_category: string;
  report_section: string;
  insufficient_data: boolean;
  used_defaults: boolean;
  contradiction_flag: boolean;
}

interface AuditCompletePayload {
  audit_id: string;
  categories: CategoryPayload[];
  total_opportunity_gbp: number;
  final_tier: string;
  audit_size_score?: number;
  flagged_for_review: boolean;
  flag_reasons: string[];
  executive_summary?: string;
  pdf_path: string;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Verify HMAC signature
  const signature = request.headers.get("X-Clearway-Signature") ?? "";
  if (process.env.N8N_WEBHOOK_SECRET && !verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: AuditCompletePayload;
  try {
    payload = JSON.parse(rawBody) as AuditCompletePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const service = createServiceClient();

  // Log the incoming webhook first
  await service.from("webhook_logs").insert({
    direction: "incoming",
    endpoint: "/api/webhooks/audit-complete",
    payload,
    response_status: 200,
    response_body: "accepted",
    audit_id: payload.audit_id,
  });

  // Verify audit exists
  const { data: audit, error: auditError } = await service
    .from("audits")
    .select("id, client_id, status")
    .eq("id", payload.audit_id)
    .single();

  if (auditError || !audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // 1. Insert 6 category rows (upsert on audit_id + category_number)
  const categoryRows = payload.categories.map((cat) => ({
    audit_id: payload.audit_id,
    category_number: cat.category_number,
    category_name: cat.category_name,
    score: cat.score,
    rag: cat.rag,
    confidence: cat.confidence,
    gbp_impact_annual: cat.gbp_impact_annual,
    gbp_calculation: cat.gbp_calculation,
    evidence: cat.evidence,
    solution_category: cat.solution_category,
    report_section: cat.report_section,
    insufficient_data: cat.insufficient_data,
    used_defaults: cat.used_defaults,
    contradiction_flag: cat.contradiction_flag,
  }));

  const { error: categoryError } = await service
    .from("audit_categories")
    .upsert(categoryRows, { onConflict: "audit_id,category_number" });

  if (categoryError) {
    console.error("[audit-complete] category insert error:", categoryError);
    return NextResponse.json({ error: categoryError.message }, { status: 500 });
  }

  // 2. Update audit row
  const { error: updateError } = await service
    .from("audits")
    .update({
      status: "awaiting_review",
      total_opportunity_gbp: payload.total_opportunity_gbp,
      final_tier: payload.final_tier,
      flagged_for_review: payload.flagged_for_review,
      flag_reasons: payload.flag_reasons,
      pdf_path: payload.pdf_path,
      audit_run_at: new Date().toISOString(),
    })
    .eq("id", payload.audit_id);

  if (updateError) {
    console.error("[audit-complete] audit update error:", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 3. Audit log
  await service.from("audit_log").insert({
    actor_id: null,
    action: "audit.completed",
    entity_type: "audit",
    entity_id: payload.audit_id,
    metadata: {
      total_opportunity_gbp: payload.total_opportunity_gbp,
      final_tier: payload.final_tier,
      flagged_for_review: payload.flagged_for_review,
      categories: payload.categories.length,
    },
  });

  // 4. Notify staff/admin via email + in-app notification
  const { data: staffUsers } = await service
    .from("users")
    .select("id, email")
    .in("role", ["admin", "staff"]);

  const { data: auditWithClient } = await service
    .from("audits")
    .select("clients(business_name)")
    .eq("id", payload.audit_id)
    .single();

  const rawClients = auditWithClient?.clients as Array<{ business_name: string }> | null;
  const businessName = (Array.isArray(rawClients) ? rawClients[0] : (rawClients as unknown as { business_name: string } | null))?.business_name ?? "Unknown business";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const staffEmails = (staffUsers ?? []).map((u) => u.email);

  // Send email to all staff (non-blocking)
  if (staffEmails.length > 0 && process.env.RESEND_API_KEY) {
    sendStaffAuditReadyEmail({
      to: staffEmails,
      businessName,
      auditId: payload.audit_id,
      flagged: payload.flagged_for_review,
      appUrl,
    }).catch(() => {});
  }

  // Create in-app notifications for all staff
  if ((staffUsers ?? []).length > 0) {
    await service.from("notifications").insert(
      (staffUsers ?? []).map((u) => ({
        user_id: u.id,
        type: "audit_ready_for_review",
        title: payload.flagged_for_review ? `⚠️ Flagged audit ready — ${businessName}` : `Audit ready for review — ${businessName}`,
        body: `${businessName} audit has completed and is awaiting your review.`,
        link: `/audits/${payload.audit_id}?tab=review`,
      }))
    );
  }

  return NextResponse.json({ ok: true });
}
