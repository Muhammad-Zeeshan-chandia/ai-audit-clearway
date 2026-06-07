"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Tabs } from "@/components/ui/tabs";
import { AuditStatusBadge, TierBadge } from "@/components/ui/badge";
import type { AuditStatus, FinalTier } from "@/lib/types";

interface AuditRow {
  id: string;
  status: AuditStatus;
  final_tier: FinalTier | null;
  total_opportunity_gbp: number | null;
  flagged_for_review: boolean;
  created_at: string;
  audit_run_at: string | null;
  sent_at: string | null;
}

interface ActivityRow {
  id: string;
  action: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface Props {
  client: Record<string, unknown>;
  audits: AuditRow[];
  activity: ActivityRow[];
  fmt: (v: number) => string;
}

const TAB_ITEMS = [
  { key: "overview",  label: "Overview" },
  { key: "audits",    label: "Audits" },
  { key: "notes",     label: "Notes" },
  { key: "activity",  label: "Activity" },
];

export function ClientDetailTabs({ client, audits, activity, fmt }: Props) {
  const [tab, setTab] = useState("overview");

  return (
    <div>
      <Tabs items={TAB_ITEMS} active={tab} onChange={setTab} className="mb-6" />

      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <InfoRow label="Email"         value={client.email as string} />
          <InfoRow label="Owner"         value={(client.owner_name as string) ?? "—"} />
          <InfoRow label="Phone"         value={(client.phone as string) ?? "—"} />
          <InfoRow label="Website"       value={(client.website_url as string) ?? "—"} />
          <InfoRow label="Call date"     value={client.call_date ? new Date(client.call_date as string).toLocaleDateString("en-GB") : "—"} />
          <InfoRow label="Consent"       value={client.consent_captured ? `Yes — ${new Date(client.consent_captured_at as string).toLocaleDateString("en-GB")}` : "Not captured"} />
          <InfoRow label="Total audits"  value={audits.length} />
          <InfoRow label="Created"       value={new Date(client.created_at as string).toLocaleDateString("en-GB")} />
        </div>
      )}

      {tab === "audits" && (
        <div className="overflow-hidden rounded-md border border-[--border]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[--border] bg-[--bg-secondary]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Tier</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Opportunity</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Created</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Sent</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {audits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-[--text-tertiary]">
                    No audits yet.
                  </td>
                </tr>
              ) : (
                audits.map((a) => (
                  <tr key={a.id} className="border-b border-[--border] last:border-0 hover:bg-[--bg-secondary]">
                    <td className="px-4 py-3"><AuditStatusBadge status={a.status} /></td>
                    <td className="px-4 py-3"><TierBadge tier={a.final_tier} /></td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {a.total_opportunity_gbp ? fmt(Number(a.total_opportunity_gbp)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-[--text-secondary]">
                      {new Date(a.created_at).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-4 py-3 text-[--text-secondary]">
                      {a.sent_at ? new Date(a.sent_at).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/audits/${a.id}`} className="text-xs text-[--accent] hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "notes" && (
        <div className="max-w-2xl">
          {client.shay_notes ? (
            <div className="rounded-md border border-[--border] bg-[--bg-secondary] px-4 py-3 text-sm text-[--text-primary] whitespace-pre-wrap">
              {client.shay_notes as string}
            </div>
          ) : (
            <p className="text-sm text-[--text-tertiary]">No notes on this client.</p>
          )}
        </div>
      )}

      {tab === "activity" && (
        <div className="max-w-2xl space-y-1">
          {activity.length === 0 ? (
            <p className="text-sm text-[--text-tertiary]">No activity recorded.</p>
          ) : (
            activity.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 border-b border-[--border] py-2.5 last:border-0"
              >
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[--accent] mt-1.5" />
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-xs text-[--accent]">{entry.action}</span>
                  <span className="ml-2 text-xs text-[--text-tertiary]">
                    {new Date(entry.created_at).toLocaleString("en-GB")}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[--text-tertiary]">{label}</p>
      <p className="mt-0.5 text-sm text-[--text-primary]">{String(value)}</p>
    </div>
  );
}
