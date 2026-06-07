import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// GET /api/settings/staff — list all staff + admin users
export async function GET() {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("users")
    .select("id, email, full_name, role, created_at")
    .in("role", ["admin", "staff"])
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staff: data ?? [] });
}

// POST /api/settings/staff — invite a new staff member
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, full_name } = await request.json() as { email: string; full_name: string };
  if (!email?.trim()) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const service = createServiceClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Generate invite link via Supabase auth admin
  const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
    type: "invite",
    email: email.toLowerCase().trim(),
    options: { redirectTo: `${appUrl}/auth/callback?next=/dashboard` },
  });

  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  // Pre-create the user row with role=staff so when they accept the invite
  // and the trigger fires, the ON CONFLICT DO NOTHING leaves role=staff intact.
  // We use the auth user ID from the generated link.
  const authUserId = linkData.user?.id;
  if (authUserId) {
    await service.from("users").upsert({
      id: authUserId,
      email: email.toLowerCase().trim(),
      full_name: full_name?.trim() || null,
      role: "staff",
    }, { onConflict: "id" });
  }

  return NextResponse.json({
    ok: true,
    invite_link: linkData.properties?.action_link ?? null,
  }, { status: 201 });
}
