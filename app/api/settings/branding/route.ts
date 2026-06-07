import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const settings: Record<string, string | null> = {};
  (data ?? []).forEach(({ key, value }) => { settings[key] = value; });
  return NextResponse.json({ settings });
}

export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as Record<string, string | null>;
  const service = createServiceClient();

  const upserts = Object.entries(body).map(([key, value]) =>
    service.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" })
  );

  await Promise.all(upserts);
  return NextResponse.json({ ok: true });
}
