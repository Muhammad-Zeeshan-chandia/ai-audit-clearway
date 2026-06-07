import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const { data: client, error } = await supabase
    .from("clients")
    .select(`
      *,
      audits(
        id, status, final_tier, total_opportunity_gbp,
        flagged_for_review, created_at, audit_run_at, sent_at
      )
    `)
    .eq("id", params.id)
    .is("deleted_at", null)
    .single();

  if (error || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { data: activity } = await supabase
    .from("audit_log")
    .select("*")
    .eq("entity_id", params.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ client, activity: activity ?? [] });
}

// PATCH /api/clients/[id]
// Updates editable client fields. Accepts any subset of the client columns.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;

  const ALLOWED_FIELDS = [
    "business_name", "owner_name", "email", "phone", "sector",
    "website_url", "call_date", "shay_notes", "consent_captured",
  ];

  const update: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) update[field] = body[field];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const service = createServiceClient();

  const { error } = await service
    .from("clients")
    .update(update)
    .eq("id", params.id)
    .is("deleted_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "client.updated",
    entity_type: "client",
    entity_id: params.id,
    metadata: { fields: Object.keys(update) },
  });

  return NextResponse.json({ ok: true });
}
