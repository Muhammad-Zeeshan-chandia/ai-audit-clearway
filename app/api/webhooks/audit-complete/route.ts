import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifySignature } from "@/lib/n8n";
import { CATEGORIES, SCORE_TO_RAG } from "@/lib/constants/categories";

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
  executive_summary?: string;
  flagged_for_review: boolean;
  flag_reasons: string[];
  pdf_path: string;
}

function validatePayload(payload: AuditCompletePayload): string | null {
  if (!payload.audit_id) return "audit_id is required";
  if (!Array.isArray(payload.categories) || payload.categories.length === 0) {
    return "categories array is required";
  }

  for (const cat of payload.categories) {
    // score must be integer 1–5
    if (!Number.isInteger(cat.score) || cat.score < 1 || cat.score > 5) {
      return `category ${cat.category_number}: score must be an integer 1–5, got ${cat.score}`;
    }
    // confidence must be integer 0–100
    if (!Number.isInteger(cat.confidence) || cat.confidence < 0 || cat.confidence > 100) {
      return `category ${cat.category_number}: confidence must be an integer 0–100, got ${cat.confidence}`;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

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

  const validationError = validatePayload(payload);
  if (validationError) {
    const service = createServiceClient();
    await service.from("webhook_logs").insert({
      direction: "incoming",
      endpoint: "/api/webhooks/audit-complete",
      payload,
      response_status: 422,
      response_body: `Validation failed: ${validationError}`,
      audit_id: payload.audit_id ?? null,
    });
    return NextResponse.json({ error: validationError }, { status: 422 });
  }

  const service = createServiceClient();

  await service.from("webhook_logs").insert({
    direction: "incoming",
    endpoint: "/api/webhooks/audit-complete",
    payload,
    response_status: 200,
    response_body: "accepted",
    audit_id: payload.audit_id,
  });

  const { data: audit, error: auditError } = await service
    .from("audits")
    .select("id, client_id, status")
    .eq("id", payload.audit_id)
    .single();

  if (auditError || !audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // Build category rows — server-recomputes RAG from score (n8n's value is informational)
  const categoryRows = payload.categories.map((cat) => {
    const canonicalCategory = CATEGORIES.find((c) => c.number === cat.category_number);
    if (canonicalCategory && cat.category_name !== canonicalCategory.name) {
      console.warn(
        `[audit-complete] category ${cat.category_number} name mismatch: ` +
        `n8n sent "${cat.category_name}", expected "${canonicalCategory.name}" — using canonical name`
      );
    }
    return {
      audit_id: payload.audit_id,
      category_number: cat.category_number,
      category_name: canonicalCategory?.name ?? cat.category_name,
      score: cat.score,
      rag: SCORE_TO_RAG(cat.score) ?? cat.rag,
      confidence: cat.confidence,
      gbp_impact_annual: cat.gbp_impact_annual,
      gbp_calculation: cat.gbp_calculation,
      evidence: cat.evidence,
      solution_category: cat.solution_category,
      report_section: cat.report_section,
      insufficient_data: cat.insufficient_data,
      used_defaults: cat.used_defaults,
      contradiction_flag: cat.contradiction_flag,
    };
  });

  const { error: categoryError } = await service
    .from("audit_categories")
    .upsert(categoryRows, { onConflict: "audit_id,category_number" });

  if (categoryError) {
    console.error("[audit-complete] category upsert error:", categoryError);
    return NextResponse.json({ error: categoryError.message }, { status: 500 });
  }

  const { error: updateError } = await service
    .from("audits")
    .update({
      status: "awaiting_review",
      total_opportunity_gbp: payload.total_opportunity_gbp,
      final_tier: payload.final_tier,
      audit_size_score: payload.audit_size_score ?? null,
      executive_summary: payload.executive_summary ?? null,
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
  const businessName =
    (Array.isArray(rawClients)
      ? rawClients[0]
      : (rawClients as unknown as { business_name: string } | null)
    )?.business_name ?? "Unknown business";

  if ((staffUsers ?? []).length > 0) {
    await service.from("notifications").insert(
      (staffUsers ?? []).map((u) => ({
        user_id: u.id,
        type: "audit_ready_for_review",
        title: payload.flagged_for_review
          ? `⚠️ Flagged audit ready — ${businessName}`
          : `Audit ready for review — ${businessName}`,
        body: `${businessName} audit has completed and is awaiting your review.`,
        link: `/audits/${payload.audit_id}?tab=review`,
      }))
    );
  }

  return NextResponse.json({ ok: true });
}
