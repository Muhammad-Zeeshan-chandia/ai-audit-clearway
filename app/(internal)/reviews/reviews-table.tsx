"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface ReviewAudit {
  id: string;
  total_opportunity_gbp: number | null;
  flagged_for_review: boolean;
  flag_reasons: string[] | null;
  audit_run_at: string | null;
  final_tier: string | null;
  client: { business_name: string; email: string } | null;
}

interface Props {
  audits: ReviewAudit[];
}

function fmt(v: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency", currency: "GBP", maximumFractionDigits: 0,
  }).format(v);
}

export function ReviewsTable({ audits }: Props) {
  const router = useRouter();

  // Per-audit action state — track which audit is being acted on
  const [approveId, setApproveId]   = useState<string | null>(null);
  const [approving, setApproving]   = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const [changesId, setChangesId]   = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [changesError, setChangesError] = useState<string | null>(null);

  async function handleApprove() {
    if (!approveId) return;
    setApproving(true);
    setApproveError(null);
    const res = await fetch(`/api/audits/${approveId}/approve`, { method: "POST" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as Record<string, string>;
      setApproveError(j.error ?? "Approval failed.");
      setApproving(false);
      return;
    }
    setApproveId(null);
    router.refresh();
  }

  async function handleRequestChanges() {
    if (!changesId || !reviewNotes.trim()) return;
    setRequesting(true);
    setChangesError(null);
    const res = await fetch(`/api/audits/${changesId}/request-changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_notes: reviewNotes }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as Record<string, string>;
      setChangesError(j.error ?? "Request failed.");
      setRequesting(false);
      return;
    }
    setChangesId(null);
    setReviewNotes("");
    router.refresh();
  }

  if (audits.length === 0) {
    return null;
  }

  return (
    <>
      <div className="overflow-hidden rounded-md border border-[--border]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[--border] bg-[--bg-secondary]">
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Business</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Tier</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Opportunity</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Run at</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Flags</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {audits.map((audit) => (
              <tr key={audit.id} className="border-b border-[--border] last:border-0 hover:bg-[--bg-secondary] transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {audit.flagged_for_review && (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-[--warning]" />
                    )}
                    <div>
                      <span className="font-medium text-[--text-primary]">{audit.client?.business_name ?? "—"}</span>
                      <p className="text-xs text-[--text-tertiary]">{audit.client?.email ?? ""}</p>
                    </div>
                  </div>
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
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => { setApproveError(null); setApproveId(audit.id); }}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setChangesError(null); setReviewNotes(""); setChangesId(audit.id); }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Changes
                    </Button>
                    <Link
                      href={`/audits/${audit.id}?tab=review`}
                      className="text-xs font-medium text-[--accent] hover:underline whitespace-nowrap"
                    >
                      Full review →
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Approve confirmation dialog */}
      <Dialog
        open={approveId !== null}
        onClose={() => !approving && setApproveId(null)}
        title="Approve & Send"
        size="sm"
        description="The PDF will be emailed to the client and the audit marked as Sent. This cannot be undone."
      >
        {approveError && (
          <p className="mb-3 rounded-md border border-[--danger] bg-red-50 px-3 py-2 text-sm text-[--danger]">
            {approveError}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setApproveId(null)} disabled={approving}>Cancel</Button>
          <Button variant="primary" size="sm" loading={approving} onClick={handleApprove}>
            Confirm &amp; Send
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Request changes dialog */}
      <Dialog
        open={changesId !== null}
        onClose={() => !requesting && setChangesId(null)}
        title="Request changes"
        size="md"
        description="Describe what needs to change. The audit engine will re-run with this feedback."
      >
        <div className="space-y-3">
          <Textarea
            rows={4}
            placeholder="e.g. The Lead Capture score seems too low — the client mentioned 80% close rate which wasn't reflected..."
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            disabled={requesting}
          />
          {changesError && (
            <p className="rounded-md border border-[--danger] bg-red-50 px-3 py-2 text-sm text-[--danger]">
              {changesError}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setChangesId(null)} disabled={requesting}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            loading={requesting}
            onClick={handleRequestChanges}
            disabled={!reviewNotes.trim()}
          >
            Submit &amp; re-run
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
