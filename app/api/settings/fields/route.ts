import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// GET /api/settings/fields?entity=client|questionnaire
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const entity = request.nextUrl.searchParams.get("entity");

  let query = supabase
    .from("field_definitions")
    .select("*")
    .order("display_order", { ascending: true });

  if (entity) query = query.eq("entity", entity as "client" | "questionnaire");

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ fields: data });
}

// POST /api/settings/fields — create a new field
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { entity, field_key, label, field_type, options, required, help_text, display_order } = body;

  if (!entity || !field_key || !label || !field_type) {
    return NextResponse.json({ error: "entity, field_key, label, field_type are required" }, { status: 400 });
  }

  const keyRegex = /^[a-z][a-z0-9_]*$/;
  if (!keyRegex.test(field_key)) {
    return NextResponse.json({ error: "field_key must match ^[a-z][a-z0-9_]*$" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("field_definitions")
    .insert({ entity, field_key, label, field_type, options: options ?? null, required: required ?? false, help_text: help_text ?? null, display_order: display_order ?? 0, active: true })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "A field with this key already exists for this entity." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ field: data }, { status: 201 });
}
