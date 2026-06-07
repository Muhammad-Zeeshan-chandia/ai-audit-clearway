import { createClient } from "@/lib/supabase/server";
import { AuditsTable } from "./audits-table";
import type { AuditStatus, FinalTier } from "@/lib/types";

type SearchParams = {
  page?: string;
  status?: string;
  tier?: string;
  flagged?: string;
  from?: string;
  to?: string;
  search?: string;
};

const STATUSES: Array<{ value: AuditStatus; label: string }> = [
  { value: "awaiting_questionnaire", label: "Awaiting questionnaire" },
  { value: "audit_running",          label: "Audit running" },
  { value: "awaiting_review",        label: "Awaiting review" },
  { value: "approved",               label: "Approved" },
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

export default async function AuditsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createClient();

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 50;
  const status = searchParams.status?.trim() ?? "";
  const tier = searchParams.tier?.trim() ?? "";
  const flagged = searchParams.flagged?.trim() ?? "";
  const from = searchParams.from ?? "";
  const to = searchParams.to ?? "";
  const search = searchParams.search?.trim() ?? "";

  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("audits")
    .select(
      `id, status, final_tier, total_opportunity_gbp, flagged_for_review,
       flag_reasons, created_at, audit_run_at, sent_at,
       clients(id, business_name, sector)`,
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (status)  query = query.eq("status", status);
  if (tier)    query = query.eq("final_tier", tier);
  if (flagged === "true")  query = query.eq("flagged_for_review", true);
  if (flagged === "false") query = query.eq("flagged_for_review", false);
  if (from)    query = query.gte("created_at", from);
  if (to)      query = query.lte("created_at", to + "T23:59:59Z");

  const { data: rawAudits, count } = await query;

  const audits = (rawAudits ?? []).map((a) => {
    const clientArr = a.clients as Array<{ id: string; business_name: string }> | null;
    const clientObj = Array.isArray(clientArr) ? clientArr[0] : (clientArr as unknown as { id: string; business_name: string } | null);
    return {
      id: a.id,
      status: a.status as AuditStatus,
      final_tier: (a.final_tier as FinalTier) ?? null,
      total_opportunity_gbp: a.total_opportunity_gbp != null ? Number(a.total_opportunity_gbp) : null,
      flagged_for_review: Boolean(a.flagged_for_review),
      flag_reasons: (a.flag_reasons ?? []) as string[],
      created_at: a.created_at,
      audit_run_at: a.audit_run_at,
      sent_at: a.sent_at,
      business_name: clientObj?.business_name ?? "—",
      client_id: clientObj?.id ?? null,
    };
  });

  return (
    <div>
      <div className="mb-6 border-b border-[--border] pb-4">
        <h1 className="text-xl font-semibold text-[--text-primary]">Audits</h1>
        <p className="mt-1 text-sm text-[--text-secondary]">All audits across all clients.</p>
      </div>

      <AuditsTable
        audits={audits}
        total={count ?? 0}
        page={page}
        pageSize={pageSize}
        statuses={STATUSES}
        tiers={TIERS}
        defaultStatus={status}
        defaultTier={tier}
        defaultFlagged={flagged}
        defaultSearch={search}
      />
    </div>
  );
}
