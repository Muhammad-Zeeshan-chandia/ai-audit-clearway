import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock } from "lucide-react";

function fmt(v: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency", currency: "GBP", maximumFractionDigits: 0,
  }).format(v);
}

export default async function ReviewsPage() {
  const supabase = createClient();

  // Flagged audits first, then oldest audit_run_at first
  const { data: audits } = await supabase
    .from("audits")
    .select(`
      id, total_opportunity_gbp, flagged_for_review, flag_reasons,
      audit_run_at, final_tier,
      clients(business_name, email)
    `)
    .eq("status", "awaiting_review")
    .is("deleted_at", null)
    .order("flagged_for_review", { ascending: false })
    .order("audit_run_at", { ascending: true });

  return (
    <div>
      <div className="mb-6 border-b border-[--border] pb-4">
        <h1 className="text-xl font-semibold text-[--text-primary]">Reviews</h1>
        <p className="mt-1 text-sm text-[--text-secondary]">
          Audits awaiting review — oldest first, flagged at the top.
        </p>
      </div>

      {(!audits || audits.length === 0) ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-[--border] bg-[--bg-secondary] py-16 text-center">
          <Clock className="mb-3 h-8 w-8 text-[--text-tertiary]" />
          <p className="text-sm font-medium text-[--text-primary]">No audits awaiting review</p>
          <p className="mt-1 text-sm text-[--text-tertiary]">
            Completed audits will appear here once the engine has run.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-[--border]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[--border] bg-[--bg-secondary]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Business</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Tier</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Opportunity</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Run at</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Flags</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {audits.map((audit) => {
                const rawClient = audit.clients as Array<{ business_name: string; email: string }> | null;
                const client = Array.isArray(rawClient) ? rawClient[0] : (rawClient as unknown as { business_name: string; email: string } | null);
                return (
                  <tr key={audit.id} className="border-b border-[--border] last:border-0 hover:bg-[--bg-secondary] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {audit.flagged_for_review && (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-[--warning]" />
                        )}
                        <span className="font-medium text-[--text-primary]">{client?.business_name ?? "—"}</span>
                      </div>
                      <p className="text-xs text-[--text-tertiary]">{client?.email ?? ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      {audit.final_tier
                        ? <Badge variant="neutral">{String(audit.final_tier)}</Badge>
                        : <span className="text-[--text-tertiary]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-[--text-primary]">
                      {audit.total_opportunity_gbp != null ? fmt(Number(audit.total_opportunity_gbp)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-[--text-secondary]">
                      {audit.audit_run_at ? new Date(audit.audit_run_at).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {audit.flagged_for_review && (
                        <div className="flex flex-wrap gap-1">
                          {((audit.flag_reasons as string[]) ?? []).slice(0, 2).map((r, i) => (
                            <Badge key={i} variant="warning">{r}</Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/audits/${audit.id}?tab=review`} className="text-xs font-medium text-[--accent] hover:underline">
                        Review →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
