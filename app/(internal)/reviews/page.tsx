import { createClient } from "@/lib/supabase/server";
import { Clock } from "lucide-react";
import { ReviewsTable } from "./reviews-table";

export const dynamic = "force-dynamic";

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

  const rows = (audits ?? []).map((a) => {
    const rawClient = a.clients as Array<{ business_name: string; email: string }> | null;
    const client = Array.isArray(rawClient)
      ? rawClient[0] ?? null
      : (rawClient as unknown as { business_name: string; email: string } | null);
    return {
      id: a.id,
      total_opportunity_gbp: a.total_opportunity_gbp,
      flagged_for_review: Boolean(a.flagged_for_review),
      flag_reasons: a.flag_reasons as string[] | null,
      audit_run_at: a.audit_run_at,
      final_tier: a.final_tier as string | null,
      client,
    };
  });

  return (
    <div>
      <div className="mb-6 border-b border-[--border] pb-4">
        <h1 className="text-xl font-semibold text-[--text-primary]">Reviews</h1>
        <p className="mt-1 text-sm text-[--text-secondary]">
          Audits awaiting review — oldest first, flagged at the top.
          Approve or request changes inline, or click &quot;Full review&quot; to open the audit.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-[--border] bg-[--bg-secondary] py-16 text-center">
          <Clock className="mb-3 h-8 w-8 text-[--text-tertiary]" />
          <p className="text-sm font-medium text-[--text-primary]">No audits awaiting review</p>
          <p className="mt-1 text-sm text-[--text-tertiary]">
            Completed audits will appear here once the engine has run.
          </p>
        </div>
      ) : (
        <ReviewsTable audits={rows} />
      )}
    </div>
  );
}
