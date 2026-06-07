import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// PATCH /api/settings/staff/[id] — change role
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role } = await request.json() as { role: string };
  if (!["admin", "staff", "client"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Prevent demoting self
  if (params.id === user.id && role !== "admin") {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 403 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("users")
    .update({ role })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
