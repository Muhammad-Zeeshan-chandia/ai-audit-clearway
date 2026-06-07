import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fireRegeneratePdfWebhook } from "@/lib/n8n";
import { SCORE_TO_RAG } from "@/lib/constants/categories";

interface CategoryUpdate {
  category_number: number;
  // All fields are optional — send only what changed
  score?: number;
  confidence?: number;
  gbp_impact_annual?: number;
  gbp_calculation?: string;
  evidence?: string;
  solution_category?: string;
  report_section?: string;
  insufficient_data?: boolean;
  used_defaults?: boolean;
  contradiction_flag?: boolean;
}

// PATCH /api/audits/[id]/categories
// Body: { updates: CategoryUpdate[] }
// RAG is server-recomputed from score on every save.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { updates: CategoryUpdate[] };
  const { updates } = body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "updates array required" }, { status: 400 });
  }

  // Validate score and confidence if present
  for (const u of updates) {
    if (u.score !== undefined) {
      if (!Number.isInteger(u.score) || u.score < 1 || u.score > 5) {
        return NextResponse.json(
          { error: `category ${u.category_number}: score must be integer 1–5` },
          { status: 400 }
        );
      }
    }
    if (u.confidence !== undefined) {
      if (!Number.isInteger(u.confidence) || u.confidence < 0 || u.confidence > 100) {
        return NextResponse.json(
          { error: `category ${u.category_number}: confidence must be integer 0–100` },
          { status: 400 }
        );
      }
    }
  }

  const service = createServiceClient();

  // Build per-category update objects; include rag when score is changing
  const ops = updates.map((u) => {
    const patch: Record<string, unknown> = {};
    if (u.score !== undefined)           { patch.score = u.score; patch.rag = SCORE_TO_RAG(u.score); }
    if (u.confidence !== undefined)      patch.confidence = u.confidence;
    if (u.gbp_impact_annual !== undefined) patch.gbp_impact_annual = u.gbp_impact_annual;
    if (u.gbp_calculation !== undefined) patch.gbp_calculation = u.gbp_calculation;
    if (u.evidence !== undefined)        patch.evidence = u.evidence;
    if (u.solution_category !== undefined) patch.solution_category = u.solution_category;
    if (u.report_section !== undefined)  patch.report_section = u.report_section;
    if (u.insufficient_data !== undefined) patch.insufficient_data = u.insufficient_data;
    if (u.used_defaults !== undefined)   patch.used_defaults = u.used_defaults;
    if (u.contradiction_flag !== undefined) patch.contradiction_flag = u.contradiction_flag;

    return service
      .from("audit_categories")
      .update(patch)
      .eq("audit_id", params.id)
      .eq("category_number", u.category_number);
  });

  const results = await Promise.all(ops);
  const failed = results.find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  // If report_section was updated, fire regenerate-PDF
  const reportUpdates = updates.filter((u) => u.report_section !== undefined);
  if (reportUpdates.length > 0) {
    // Fetch current executive_summary for the PDF regeneration
    const { data: auditRow } = await service
      .from("audits")
      .select("executive_summary, client_id")
      .eq("id", params.id)
      .single();

    // Fetch all current sections (merge edited + existing)
    const { data: allCats } = await service
      .from("audit_categories")
      .select("category_number, report_section")
      .eq("audit_id", params.id)
      .order("category_number");

    const mergedSections = (allCats ?? []).map((c) => {
      const override = reportUpdates.find((u) => u.category_number === c.category_number);
      return {
        category_number: c.category_number,
        report_section: override?.report_section ?? c.report_section ?? "",
      };
    });

    fireRegeneratePdfWebhook(
      {
        audit_id: params.id,
        executive_summary: auditRow?.executive_summary ?? undefined,
        categories: mergedSections,
      },
      params.id
    ).catch((err) => console.error("[categories] regenerate-pdf webhook error:", err));
  }

  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.categories_edited",
    entity_type: "audit",
    entity_id: params.id,
    metadata: {
      categories_updated: updates.map((u) => u.category_number),
      fields_changed: Array.from(new Set(updates.flatMap((u) => Object.keys(u).filter((k) => k !== "category_number")))),
    },
  });

  return NextResponse.json({ ok: true });
}
