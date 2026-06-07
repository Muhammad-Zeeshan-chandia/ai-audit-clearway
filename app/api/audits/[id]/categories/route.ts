import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fireRegeneratePdfWebhook } from "@/lib/n8n";

// PATCH /api/audits/[id]/categories
// Body: { updates: Array<{ id: string; report_section: string }> }
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { updates } = await request.json() as {
    updates: Array<{ id: string; report_section: string; category_number: number }>;
  };

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "updates array required" }, { status: 400 });
  }

  const service = createServiceClient();

  // Update each category's report_section
  const ops = updates.map(({ id, report_section }) =>
    service
      .from("audit_categories")
      .update({ report_section })
      .eq("id", id)
      .eq("audit_id", params.id)
  );

  const results = await Promise.all(ops);
  const failed = results.find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  // Fire regenerate-PDF webhook
  fireRegeneratePdfWebhook(
    {
      audit_id: params.id,
      categories: updates.map(({ category_number, report_section }) => ({
        category_number,
        report_section,
      })),
    },
    params.id
  ).catch((err) => console.error("[categories] regenerate-pdf webhook error:", err));

  // Audit log
  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.report_sections_edited",
    entity_type: "audit",
    entity_id: params.id,
    metadata: { categories_updated: updates.length },
  });

  return NextResponse.json({ ok: true });
}
