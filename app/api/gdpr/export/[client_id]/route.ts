/**
 * GET /api/gdpr/export/[client_id]
 *
 * Returns a complete JSON export of all data held about a client.
 * Access: staff/admin only.
 *
 * Includes: client record, all audits, audit categories (per audit),
 * questionnaire responses, and the audit trail.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: { client_id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  // Verify caller is staff/admin
  const { data: profile } = await service
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "staff"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden — staff or admin only." }, { status: 403 });
  }

  // Fetch all data in parallel
  const [
    { data: client },
    { data: audits },
    { data: questionnaires },
    { data: activityLog },
  ] = await Promise.all([
    service
      .from("clients")
      .select("*")
      .eq("id", params.client_id)
      .single(),

    service
      .from("audits")
      .select("*, audit_categories(*)")
      .eq("client_id", params.client_id)
      .order("created_at", { ascending: true }),

    service
      .from("questionnaires")
      .select("*")
      .in(
        "audit_id",
        // Sub-select audit IDs for this client (will be resolved after audit fetch)
        // Using a workaround: fetch audit IDs separately
        await service
          .from("audits")
          .select("id")
          .eq("client_id", params.client_id)
          .then(({ data }) => (data ?? []).map((a) => a.id))
      ),

    service
      .from("audit_log")
      .select("*")
      .eq("entity_type", "client")
      .eq("entity_id", params.client_id)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (!client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  const exportData = {
    exported_at: new Date().toISOString(),
    exported_by: user.email,
    client,
    audits: audits ?? [],
    questionnaires: questionnaires ?? [],
    activity_log: activityLog ?? [],
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="clearway-gdpr-export-${params.client_id}.json"`,
    },
  });
}
