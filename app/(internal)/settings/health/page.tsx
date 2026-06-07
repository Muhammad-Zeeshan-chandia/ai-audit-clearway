import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

function fmt(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

export default async function HealthPage() {
  const supabase = createClient();

  const [
    { data: statusCounts },
    { data: recentFailures },
    { data: runTimes },
    { data: pendingDeletions },
  ] = await Promise.all([
    // Audit queue depths by status
    supabase
      .from("audits")
      .select("status")
      .is("deleted_at", null),

    // Recent webhook failures (status >= 400 or null response)
    supabase
      .from("webhook_logs")
      .select("id, direction, endpoint, response_status, response_body, created_at, audit_id")
      .or("response_status.gte.400,response_status.is.null")
      .order("created_at", { ascending: false })
      .limit(20),

    // Audits with both questionnaire_submitted_at and audit_run_at (for avg run time)
    supabase
      .from("audits")
      .select("questionnaire_submitted_at, audit_run_at")
      .not("questionnaire_submitted_at", "is", null)
      .not("audit_run_at", "is", null)
      .limit(100),

    // Pending GDPR deletion requests
    supabase
      .from("gdpr_deletion_requests")
      .select("id, grace_ends_at, clients(business_name)")
      .eq("status", "pending")
      .order("grace_ends_at", { ascending: true }),
  ]);

  // Aggregate status counts
  const statusMap = (statusCounts ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  // Average audit run time
  const avgMs = (() => {
    const rows = (runTimes ?? []).filter(
      (r) => r.questionnaire_submitted_at && r.audit_run_at
    );
    if (!rows.length) return null;
    const total = rows.reduce(
      (sum, r) =>
        sum +
        (new Date(r.audit_run_at!).getTime() -
          new Date(r.questionnaire_submitted_at!).getTime()),
      0
    );
    return total / rows.length;
  })();

  const STATUS_ORDER = [
    "awaiting_questionnaire",
    "audit_running",
    "awaiting_review",
    "approved",
    "sent",
    "failed",
    "archived",
  ];

  return (
    <div>
      <div className="mb-6 border-b border-[--border] pb-4">
        <h1 className="text-xl font-semibold text-[--text-primary]">System health</h1>
        <p className="mt-1 text-sm text-[--text-secondary]">
          Queue depths, webhook failures, and GDPR status.
        </p>
      </div>

      {/* Queue depths */}
      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-[--text-primary]">Audit queue</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {STATUS_ORDER.map((status) => (
            <div
              key={status}
              className="rounded-md border border-[--border] bg-[--bg-primary] p-3 text-center"
            >
              <p className="tabular-nums text-2xl font-semibold text-[--text-primary]">
                {statusMap[status] ?? 0}
              </p>
              <p className="mt-0.5 text-xs text-[--text-tertiary] leading-tight">
                {status.replace(/_/g, " ")}
              </p>
            </div>
          ))}
        </div>

        {avgMs !== null && (
          <p className="mt-3 text-sm text-[--text-secondary]">
            Average audit run time:{" "}
            <span className="font-medium text-[--text-primary]">{fmt(avgMs)}</span>{" "}
            <span className="text-[--text-tertiary]">(based on last {(runTimes ?? []).length} audits)</span>
          </p>
        )}
      </div>

      {/* Webhook failures */}
      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-[--text-primary]">
          Recent webhook failures
          {(recentFailures ?? []).length > 0 && (
            <Badge variant="danger" className="ml-2">{recentFailures!.length}</Badge>
          )}
        </h2>
        {(!recentFailures || recentFailures.length === 0) ? (
          <p className="text-sm text-[--success]">✓ No webhook failures</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-[--border]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[--border] bg-[--bg-secondary]">
                  <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">Dir</th>
                  <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">Endpoint</th>
                  <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">Time</th>
                  <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">Audit</th>
                </tr>
              </thead>
              <tbody>
                {recentFailures.map((log) => (
                  <tr key={log.id} className="border-b border-[--border] last:border-0">
                    <td className="px-3 py-2">
                      <Badge variant={log.direction === "outgoing" ? "accent" : "neutral"}>
                        {log.direction}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-[--text-secondary] max-w-[160px] truncate">
                      {log.endpoint ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="danger">{log.response_status ?? "no response"}</Badge>
                    </td>
                    <td className="px-3 py-2 text-[--text-tertiary]">
                      {new Date(log.created_at).toLocaleString("en-GB")}
                    </td>
                    <td className="px-3 py-2">
                      {log.audit_id ? (
                        <Link href={`/audits/${log.audit_id}?tab=logs`} className="text-[--accent] hover:underline">
                          view
                        </Link>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending GDPR deletions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-[--text-primary]">Pending data deletions</h2>
        {(!pendingDeletions || pendingDeletions.length === 0) ? (
          <p className="text-sm text-[--text-secondary]">No pending deletion requests.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-[--border]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--border] bg-[--bg-secondary]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Client</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Grace period ends</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Days remaining</th>
                </tr>
              </thead>
              <tbody>
                {pendingDeletions.map((req) => {
                  const clientArr = req.clients as Array<{ business_name: string }> | null;
                  const client = Array.isArray(clientArr) ? clientArr[0] : (clientArr as unknown as { business_name: string } | null);
                  const daysLeft = Math.max(0, Math.ceil(
                    (new Date(req.grace_ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
                  ));
                  return (
                    <tr key={req.id} className="border-b border-[--border] last:border-0">
                      <td className="px-4 py-3 font-medium text-[--text-primary]">{client?.business_name ?? "—"}</td>
                      <td className="px-4 py-3 text-[--text-secondary]">
                        {new Date(req.grace_ends_at).toLocaleDateString("en-GB")}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={daysLeft <= 1 ? "danger" : daysLeft <= 3 ? "warning" : "neutral"}>
                          {daysLeft} {daysLeft === 1 ? "day" : "days"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
