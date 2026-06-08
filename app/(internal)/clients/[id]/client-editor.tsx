"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs } from "@/components/ui/tabs";
import { AuditStatusBadge, TierBadge, Badge } from "@/components/ui/badge";
import type { AuditStatus, FinalTier, FieldDefinition, FieldType } from "@/lib/types";

const SECTOR_LABELS: Record<string, string> = {
  restaurant:          "Restaurant",
  clinic_dental:       "Dental / Clinic",
  trades:              "Trades",
  agency_consultancy:  "Agency / Consultancy",
  retail_ecommerce:    "Retail / eCommerce",
  gym_fitness:         "Gym / Fitness",
  salon_beauty:        "Salon / Beauty",
  hotel_hospitality:   "Hotel / Hospitality",
  other:               "Other",
};

const TAB_ITEMS = [
  { key: "info",     label: "Client info" },
  { key: "audits",   label: "Audits" },
  { key: "activity", label: "Activity" },
];

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
  totalAuditCount: number;
  activity: ActivityRow[];
  clientFields: FieldDefinition[];
  fmt: (v: number) => string;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const strVal = value == null ? "" : String(value);
  const type = field.field_type as FieldType;

  if (type === "long_text") {
    return (
      <Textarea
        rows={3}
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.help_text ?? ""}
      />
    );
  }
  if (type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[--accent]"
      />
    );
  }
  if (type === "select" && field.options) {
    return (
      <select
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-[--border] bg-[--bg-primary] px-3 py-2 text-sm text-[--text-primary] focus:outline-none focus:ring-2 focus:ring-[--accent]"
      >
        <option value="">—</option>
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  if (type === "number") {
    return (
      <Input
        type="number"
        value={strVal}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        placeholder={field.help_text ?? ""}
      />
    );
  }
  if (type === "date") {
    return (
      <Input
        type="date"
        value={strVal}
        onChange={(e) => onChange(e.target.value || null)}
      />
    );
  }
  return (
    <Input
      type={type === "email" ? "email" : "text"}
      value={strVal}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.help_text ?? ""}
    />
  );
}

export function ClientEditor({ client: initialClient, audits, totalAuditCount, activity, clientFields, fmt }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState("info");
  const [data, setData] = useState<Record<string, unknown>>(initialClient);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [startSuccess, setStartSuccess] = useState(false);

  const clientId = initialClient.id as string;

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setSaveError(j.error ?? "Save failed.");
    } else {
      router.refresh();
    }
  }

  async function handleStartAudit() {
    setStarting(true);
    setStartError(null);
    setStartSuccess(false);
    const res = await fetch(`/api/clients/${clientId}/audits`, { method: "POST" });
    setStarting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setStartError(j.error ?? "Could not create audit.");
    } else {
      const j = await res.json().catch(() => ({}));
      setStartSuccess(true);
      if (j.audit_id) router.push(`/audits/${j.audit_id}`);
    }
  }

  const sectorLabel = data.sector ? (SECTOR_LABELS[data.sector as string] ?? String(data.sector)) : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 border-b border-[--border] pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold text-[--text-primary]">
                {(data.business_name as string) || "Client"}
              </h1>
              {sectorLabel && <Badge variant="neutral">{sectorLabel}</Badge>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-4 text-sm text-[--text-secondary]">
              {data.owner_name ? <span>{String(data.owner_name)}</span> : null}
              <span>{String(data.email ?? "")}</span>
              {data.phone ? <span>{String(data.phone)}</span> : null}
              {data.website_url ? (
                <a
                  href={String(data.website_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[--accent] hover:underline"
                >
                  {String(data.website_url)}
                </a>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button variant="primary" size="sm" loading={starting} onClick={handleStartAudit}>
              <Plus className="h-4 w-4" />
              Start new audit
            </Button>
            {startError && <p className="text-xs text-[--danger]">{startError}</p>}
            {startSuccess && <p className="text-xs text-emerald-600">Audit created — redirecting…</p>}
          </div>
        </div>
      </div>

      <Tabs items={TAB_ITEMS} active={tab} onChange={setTab} className="mb-6" />

      {/* Client info tab */}
      {tab === "info" && (
        <div className="max-w-3xl space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {clientFields.map((field) => (
              <div key={field.id}>
                <label className="mb-1 block text-xs font-medium text-[--text-tertiary]">
                  {field.label}{field.required && " *"}
                </label>
                <FieldInput
                  field={field}
                  value={data[field.field_key]}
                  onChange={(v) => setData((prev) => ({ ...prev, [field.field_key]: v }))}
                />
                {field.help_text && field.field_type !== "text" && (
                  <p className="mt-0.5 text-xs text-[--text-tertiary]">{field.help_text}</p>
                )}
              </div>
            ))}
          </div>
          {saveError && <p className="text-xs text-[--danger]">{saveError}</p>}
          <Button variant="secondary" size="sm" loading={saving} onClick={handleSave}>
            <Save className="h-3.5 w-3.5" />
            Save changes
          </Button>
        </div>
      )}

      {/* Audits tab */}
      {tab === "audits" && (
        <div>
          {audits.length === 0 ? (
            <div className="rounded-md border border-[--border] px-6 py-10 text-center">
              <p className="text-sm text-[--text-tertiary]">No audits yet.</p>
              <Button variant="secondary" size="sm" loading={starting} onClick={handleStartAudit} className="mt-4">
                <Plus className="h-4 w-4" />
                Start first audit
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {totalAuditCount > 3 && (
                <p className="text-xs text-[--text-tertiary]">
                  Showing the latest 3 of {totalAuditCount} audits for this client.
                </p>
              )}
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
                  {audits.map((a) => (
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
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </div>
      )}

      {/* Activity tab */}
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
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[--accent]" />
                <div className="min-w-0 flex-1">
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
