import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AuditStatusBadge, TierBadge } from "@/components/ui/badge";
import type { AuditStatus, FinalTier } from "@/lib/types";

function fmt(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-[--border] bg-[--bg-primary] px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[--text-tertiary]">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-[--text-primary]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[--text-tertiary]">{sub}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = createClient();

  // Stats
  const [
    { count: activeCount },
    { count: awaitingCount },
    { count: sentCount },
    { data: opportunities },
    { data: recentAudits },
  ] = await Promise.all([
    supabase
      .from("audits")
      .select("*", { count: "exact", head: true })
      .not("status", "in", '("sent","archived","failed")')
      .is("deleted_at", null),

    supabase
      .from("audits")
      .select("*", { count: "exact", head: true })
      .eq("status", "awaiting_review")
      .is("deleted_at", null),

    supabase
      .from("audits")
      .select("*", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),

    supabase
      .from("audits")
      .select("total_opportunity_gbp")
      .is("deleted_at", null)
      .not("total_opportunity_gbp", "is", null)
      .limit(10000),

    supabase
      .from("audits")
      .select(
        `id, status, final_tier, total_opportunity_gbp, flagged_for_review, created_at,
         clients(business_name, sector)`
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const totalOpportunity = (opportunities ?? []).reduce(
    (sum, row) => sum + Number(row.total_opportunity_gbp ?? 0),
    0
  );

  return (
    <div>
      <div className="mb-6 border-b border-[--border] pb-4">
        <h1 className="text-xl font-semibold text-[--text-primary]">Dashboard</h1>
        <p className="mt-1 text-sm text-[--text-secondary]">Overview of all audits and activity.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Active audits"        value={activeCount ?? 0} />
        <StatCard label="Awaiting review"      value={awaitingCount ?? 0} />
        <StatCard
          label="Sent this month"
          value={sentCount ?? 0}
          sub={new Date().toLocaleString("en-GB", { month: "long", year: "numeric" })}
        />
        <StatCard
          label="Total opportunity"
          value={fmt(totalOpportunity)}
          sub="across all audits"
        />
      </div>

      {/* Recent audits */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[--text-primary]">Recent audits</h2>
          <Link href="/audits" className="text-xs text-[--accent] hover:underline">
            View all →
          </Link>
        </div>

        <div className="overflow-hidden rounded-md border border-[--border]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[--border] bg-[--bg-secondary]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Business</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Tier</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Opportunity</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Created</th>
              </tr>
            </thead>
            <tbody>
              {(recentAudits ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-[--text-tertiary]">
                    No audits yet. <Link href="/clients/new" className="text-[--accent] hover:underline">Create the first one →</Link>
                  </td>
                </tr>
              ) : (
                (recentAudits ?? []).map((audit) => {
                  const clientData = audit.clients as Array<{ business_name: string; sector: string }> | null;
                  const client = Array.isArray(clientData) ? clientData[0] : (clientData as unknown as { business_name: string; sector: string } | null);
                  return (
                    <tr
                      key={audit.id}
                      className="border-b border-[--border] last:border-0 hover:bg-[--bg-secondary] transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium text-[--text-primary]">
                        <Link href={`/audits/${audit.id}`} className="hover:text-[--accent]">
                          {client?.business_name ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <AuditStatusBadge status={audit.status as AuditStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <TierBadge tier={(audit.final_tier as FinalTier) ?? null} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[--text-primary]">
                        {audit.total_opportunity_gbp ? fmt(Number(audit.total_opportunity_gbp)) : "—"}
                      </td>
                      <td className="px-4 py-3 text-[--text-secondary]">
                        {new Date(audit.created_at).toLocaleDateString("en-GB")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
