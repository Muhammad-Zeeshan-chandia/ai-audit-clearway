import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// PATCH /api/settings/fields/[id] — update label, options, required, active, help_text, display_order
// field_key is read-only once used
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const service = createServiceClient();

  // Load the current field
  const { data: existing, error: fetchErr } = await service
    .from("field_definitions")
    .select("*")
    .eq("id", params.id)
    .single();

  if (fetchErr || !existing) return NextResponse.json({ error: "Field not found" }, { status: 404 });

  // If field_key is being changed, verify it isn't already in use
  if (body.field_key && body.field_key !== existing.field_key) {
    const keyRegex = /^[a-z][a-z0-9_]*$/;
    if (!keyRegex.test(body.field_key as string)) {
      return NextResponse.json({ error: "field_key must match ^[a-z][a-z0-9_]*$" }, { status: 400 });
    }

    // Check usage in questionnaires (sample first 500)
    const { data: questionnaires } = await service
      .from("questionnaires")
      .select("data")
      .range(0, 499);

    const isUsed = (questionnaires ?? []).some(
      (q) => existing.field_key in (q.data as Record<string, unknown>)
    );

    if (isUsed) {
      return NextResponse.json(
        { error: "field_key cannot be changed — this field has been used in submitted questionnaires." },
        { status: 409 }
      );
    }
  }

  // Build the update payload (only allowed fields)
  const allowed = ["label", "field_key", "field_type", "options", "required", "help_text", "active", "display_order"] as const;
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  const { data, error } = await service
    .from("field_definitions")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ field: data });
}

// DELETE /api/settings/fields/[id] — soft delete (set active = false)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { error } = await service
    .from("field_definitions")
    .update({ active: false })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
