import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const entity = request.nextUrl.searchParams.get("entity");
  if (!entity || (entity !== "client" && entity !== "questionnaire")) {
    return NextResponse.json({ error: "entity must be 'client' or 'questionnaire'" }, { status: 400 });
  }

  const supabase = createClient();

  const { data, error } = await supabase
    .from("field_definitions")
    .select("*")
    .eq("entity", entity)
    .eq("active", true)
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ fields: data });
}
