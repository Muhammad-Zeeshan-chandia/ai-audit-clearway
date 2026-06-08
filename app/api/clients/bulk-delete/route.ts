import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { ids?: unknown };
  const ids = body.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
  }

  const service = createServiceClient();
  const now = new Date().toISOString();

  await service
    .from("audits")
    .update({ deleted_at: now })
    .in("client_id", ids as string[])
    .is("deleted_at", null);

  const { error } = await service
    .from("clients")
    .update({ deleted_at: now })
    .in("id", ids as string[])
    .is("deleted_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await service.from("audit_log").insert(
    (ids as string[]).map((id) => ({
      actor_id: user.id,
      action: "client.deleted",
      entity_type: "client",
      entity_id: id,
      metadata: { bulk: true },
    }))
  );

  return NextResponse.json({ ok: true, deleted: ids.length });
}
