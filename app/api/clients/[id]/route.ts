import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  // Activity log
  const { data: activity } = await supabase
    .from("audit_log")
    .select("*")
    .eq("entity_id", params.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ client, activity: activity ?? [] });
}
