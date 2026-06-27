import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { firePdfGenWebhook } from "@/lib/n8n";

// POST /api/audits/[id]/generate-pdf
// Triggers the separate PDF-generation workflow. Available once the final
// audit is complete. The workflow stores the PDF and calls /api/webhooks/pdf-ready.
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
    .select("id, status, executive_summary, final_tier, total_opportunity_gbp")
    .eq("id", params.id)
    .single();

  if (!audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  if (audit.status !== "final_review") {
    return NextResponse.json(
      { error: "The PDF can be generated once the final audit is complete." },
      { status: 409 }
    );
  }

  const { data: cats } = await service
    .from("audit_categories")
    .select("category_number, category_name, report_section")
    .eq("audit_id", params.id)
    .order("category_number");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  firePdfGenWebhook(
    {
      audit_id: params.id,
      callback_url: `${appUrl}/api/webhooks/pdf-ready`,
      categories: (cats ?? []).map((c) => ({
        category_number: c.category_number,
        category_name: c.category_name,
        report_section: (c.report_section as string | null) ?? null,
      })),
      executive_summary: (audit.executive_summary as string | null) ?? null,
      final_tier: (audit.final_tier as string | null) ?? null,
      total_opportunity_gbp:
        audit.total_opportunity_gbp != null ? Number(audit.total_opportunity_gbp) : null,
    },
    params.id
  ).catch((err) => console.error("[generate-pdf] webhook error:", err));

  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.pdf_generation_requested",
    entity_type: "audit",
    entity_id: params.id,
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
