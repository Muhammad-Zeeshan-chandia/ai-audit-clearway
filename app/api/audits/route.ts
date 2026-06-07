import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/audits?page=1&status=&tier=&flagged=&from=&to=&search=
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const params = request.nextUrl.searchParams;

  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10));
  const pageSize = 50;
  const status = params.get("status")?.trim() ?? "";
  const tier = params.get("tier")?.trim() ?? "";
  const flagged = params.get("flagged")?.trim() ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const search = params.get("search")?.trim() ?? "";

  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("audits")
    .select(
      `id, status, final_tier, total_opportunity_gbp, flagged_for_review,
       flag_reasons, created_at, audit_run_at, sent_at, deleted_at,
       clients(id, business_name, email, sector)`,
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (status) query = query.eq("status", status);
  if (tier)   query = query.eq("final_tier", tier);
  if (flagged === "true")  query = query.eq("flagged_for_review", true);
  if (flagged === "false") query = query.eq("flagged_for_review", false);
  if (from) query = query.gte("created_at", from);
  if (to)   query = query.lte("created_at", to + "T23:59:59Z");

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Client-side search filter by business name
  const filtered = search
    ? (data ?? []).filter((a) => {
        const c = a.clients as Array<{ business_name: string }> | null;
        const name = (Array.isArray(c) ? c[0] : (c as unknown as { business_name: string } | null))?.business_name ?? "";
        return name.toLowerCase().includes(search.toLowerCase());
      })
    : data ?? [];

  return NextResponse.json({ audits: filtered, total: count ?? 0, page, pageSize });
}
