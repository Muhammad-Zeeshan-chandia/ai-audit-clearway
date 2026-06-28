import { createServiceClient } from "@/lib/supabase/server";
import { WideAuditsTable } from "./wide-audits-table";
import { CATEGORIES } from "@/lib/constants/categories";
import type { AuditStatus, FinalTier } from "@/lib/types";

export const dynamic = "force-dynamic";

const SECTORS = [
  { value: "restaurant",         label: "Restaurant" },
  { value: "clinic_dental",      label: "Dental / Clinic" },
  { value: "trades",             label: "Trades" },
  { value: "agency_consultancy", label: "Agency / Consultancy" },
  { value: "retail_ecommerce",   label: "Retail / eCommerce" },
  { value: "gym_fitness",        label: "Gym / Fitness" },
  { value: "salon_beauty",       label: "Salon / Beauty" },
  { value: "hotel_hospitality",  label: "Hotel / Hospitality" },
  { value: "other",              label: "Other" },
];

const STATUSES: Array<{ value: AuditStatus; label: string }> = [
  { value: "awaiting_questionnaire", label: "Awaiting questionnaire" },
  { value: "audit_running",          label: "Audit running" },
  { value: "awaiting_review",        label: "Initial review" },
  { value: "awaiting_answers",       label: "Awaiting answers" },
  { value: "answers_received",       label: "Answers received" },
  { value: "final_review",           label: "Final review" },
  { value: "sent",                   label: "Sent" },
  { value: "failed",                 label: "Failed" },
  { value: "archived",               label: "Archived" },
];

const TIERS: Array<{ value: FinalTier; label: string }> = [
  { value: "Starter",     label: "Starter" },
  { value: "Standard",    label: "Standard" },
  { value: "Growth",      label: "Growth" },
  { value: "Established", label: "Established" },
  { value: "Enterprise",  label: "Enterprise" },
];

type SearchParams = {
  page?: string;
  status?: string;
  tier?: string;
  sector?: string;
  flagged?: string;
  from?: string;
  to?: string;
  search?: string;
};

export default async function AuditsPage({ searchParams }: { searchParams: SearchParams }) {
  const service = createServiceClient();

  const page     = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 50;
  const status   = searchParams.status?.trim() ?? "";
  const tier     = searchParams.tier?.trim() ?? "";
  const sector   = searchParams.sector?.trim() ?? "";
  const flagged  = searchParams.flagged?.trim() ?? "";
  const from     = searchParams.from ?? "";
  const to       = searchParams.to ?? "";
  const search   = searchParams.search?.trim() ?? "";
  const offset   = (page - 1) * pageSize;

  let query = service
    .from("v_audits_wide")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

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

  const { data: rows, count } = await query;

  // Build canonical export URL preserving current filters
  const exportParams = new URLSearchParams();
  if (status)  exportParams.set("status", status);
  if (tier)    exportParams.set("tier", tier);
  if (sector)  exportParams.set("sector", sector);
  if (flagged) exportParams.set("flagged", flagged);
  if (from)    exportParams.set("from", from);
  if (to)      exportParams.set("to", to);
  if (search)  exportParams.set("search", search);
  const exportUrl = `/api/audits/export?${exportParams.toString()}`;

  const audits = (rows ?? []).map((r) => {
    const q = (r.questionnaire ?? {}) as Record<string, unknown>;
    return {
      audit_id:                    r.audit_id as string,
      client_id:                   r.client_id as string,
      status:                      r.status as AuditStatus,
      created_at:                  r.created_at as string,
      questionnaire_submitted_at:  r.questionnaire_submitted_at as string | null,
      audit_run_at:                r.audit_run_at as string | null,
      total_opportunity_gbp:       r.total_opportunity_gbp != null ? Number(r.total_opportunity_gbp) : null,
      audit_size_score:            r.audit_size_score != null ? Number(r.audit_size_score) : null,
      final_tier:                  (r.final_tier as FinalTier) ?? null,
      tier_overridden:             Boolean(r.tier_overridden),
      flagged_for_review:          Boolean(r.flagged_for_review),
      reviewed_by:                 r.reviewed_by as string | null,
      review_notes:                r.review_notes as string | null,
      sent_at:                     r.sent_at as string | null,
      pdf_path:                    r.pdf_path as string | null,
      business_name:               r.business_name as string,
      owner_name:                  r.owner_name as string | null,
      client_email:                r.client_email as string,
      phone:                       r.phone as string | null,
      sector:                      r.sector as string | null,
      call_date:                   r.call_date as string | null,
      consent_captured:            Boolean(r.consent_captured),
      customer_facing_staff:       q["customer_facing_staff"] != null ? String(q["customer_facing_staff"]) : null,
      fix_one_thing:               q["fix_one_thing"]         != null ? String(q["fix_one_thing"])         : null,
      c1_score: r.c1_score != null ? Number(r.c1_score) : null,
      c1_gbp:   r.c1_gbp  != null ? Number(r.c1_gbp)  : null,
      c2_score: r.c2_score != null ? Number(r.c2_score) : null,
      c2_gbp:   r.c2_gbp  != null ? Number(r.c2_gbp)  : null,
      c3_score: r.c3_score != null ? Number(r.c3_score) : null,
      c3_gbp:   r.c3_gbp  != null ? Number(r.c3_gbp)  : null,
      c4_score: r.c4_score != null ? Number(r.c4_score) : null,
      c4_gbp:   r.c4_gbp  != null ? Number(r.c4_gbp)  : null,
      c5_score: r.c5_score != null ? Number(r.c5_score) : null,
      c5_gbp:   r.c5_gbp  != null ? Number(r.c5_gbp)  : null,
      c6_score: r.c6_score != null ? Number(r.c6_score) : null,
      c6_gbp:   r.c6_gbp  != null ? Number(r.c6_gbp)  : null,
    };
  });

  return (
    <div>
      <div className="mb-4 border-b border-[--border] pb-4">
        <h1 className="text-xl font-semibold text-[--text-primary]">Audits</h1>
        <p className="mt-1 text-sm text-[--text-secondary]">All audits — {count ?? 0} total.</p>
      </div>

      <WideAuditsTable
        audits={audits}
        total={count ?? 0}
        page={page}
        pageSize={pageSize}
        statuses={STATUSES}
        tiers={TIERS}
        sectors={SECTORS}
        categories={CATEGORIES as unknown as Array<{ number: number; shortName: string; name: string }>}
        defaultStatus={status}
        defaultTier={tier}
        defaultSector={sector}
        defaultFlagged={flagged}
        defaultSearch={search}
        exportUrl={exportUrl}
      />
    </div>
  );
}
