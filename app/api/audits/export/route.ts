import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CATEGORIES } from "@/lib/constants/categories";

function fmtDate(v: string | null | undefined) {
  if (!v) return "";
  return new Date(v).toLocaleDateString("en-GB");
}

function fmtGbp(v: number | null | undefined) {
  if (v == null) return "";
  return v.toFixed(0);
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s}"`;
  return s;
}

// GET /api/audits/export
// Returns a CSV download of the currently-filtered audit list.
// Accepts the same search params as the audits list page.
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return new NextResponse("Unauthorized", { status: 401 });

  const sp = request.nextUrl.searchParams;
  const status  = sp.get("status") ?? "";
  const tier    = sp.get("tier") ?? "";
  const flagged = sp.get("flagged") ?? "";
  const sector  = sp.get("sector") ?? "";
  const from    = sp.get("from") ?? "";
  const to      = sp.get("to") ?? "";
  const search  = sp.get("search")?.trim() ?? "";

  const service = createServiceClient();

  let query = service
    .from("v_audits_wide")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (status)  query = query.eq("status", status);
  if (tier)    query = query.eq("final_tier", tier);
  if (sector)  query = query.eq("sector", sector);
  if (flagged === "true")  query = query.eq("flagged_for_review", true);
  if (flagged === "false") query = query.eq("flagged_for_review", false);
  if (from)    query = query.gte("created_at", from);
  if (to)      query = query.lte("created_at", to + "T23:59:59Z");
  if (search)  query = query.or(
    `business_name.ilike.%${search}%,owner_name.ilike.%${search}%,client_email.ilike.%${search}%`
  );

  const { data: rows, error } = await query;
  if (error) return new NextResponse("Query failed: " + error.message, { status: 500 });

  const catHeaders = CATEGORIES.flatMap((c) => [
    `${c.shortName} Score`,
    `${c.shortName} £/yr`,
  ]);

  const headers = [
    "Business", "Owner", "Email", "Phone", "Sector", "Call Date", "Consent",
    "Status", "Created", "Q.Submitted", "Staff Count", "Sites", "Biggest Pain",
    ...catHeaders,
    "Total £", "Size Score", "Tier", "Tier Overridden",
    "Audit Run", "PDF Path", "Reviewed By", "Review Notes", "Sent", "Flagged",
  ];

  const csvRows = (rows ?? []).map((r) => {
    const q = (r.questionnaire ?? {}) as Record<string, unknown>;
    return [
      r.business_name,
      r.owner_name,
      r.client_email,
      r.phone,
      r.sector,
      fmtDate(r.call_date),
      r.consent_captured ? "Yes" : "No",
      r.status,
      fmtDate(r.created_at),
      fmtDate(r.questionnaire_submitted_at),
      q["staff_count"],
      q["sites_count"],
      q["main_challenge"],
      r.c1_score, fmtGbp(r.c1_gbp),
      r.c2_score, fmtGbp(r.c2_gbp),
      r.c3_score, fmtGbp(r.c3_gbp),
      r.c4_score, fmtGbp(r.c4_gbp),
      r.c5_score, fmtGbp(r.c5_gbp),
      r.c6_score, fmtGbp(r.c6_gbp),
      fmtGbp(r.total_opportunity_gbp),
      r.audit_size_score,
      r.final_tier,
      r.tier_overridden ? "Yes" : "No",
      fmtDate(r.audit_run_at),
      r.pdf_path,
      r.reviewed_by,
      r.review_notes,
      fmtDate(r.sent_at),
      r.flagged_for_review ? "Yes" : "No",
    ].map(csvEscape).join(",");
  });

  const csv = [headers.join(","), ...csvRows].join("\n");
  const filename = `clearway-audits-${new Date().toISOString().split("T")[0]}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
