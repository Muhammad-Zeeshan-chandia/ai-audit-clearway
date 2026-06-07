"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle } from "lucide-react";
import { DataTable } from "@/components/tables/data-table";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AuditStatusBadge, TierBadge } from "@/components/ui/badge";
import type { AuditStatus, FinalTier } from "@/lib/types";

interface AuditRow {
  id: string;
  status: AuditStatus;
  final_tier: FinalTier | null;
  total_opportunity_gbp: number | null;
  flagged_for_review: boolean;
  flag_reasons: string[];
  created_at: string;
  audit_run_at: string | null;
  sent_at: string | null;
  business_name: string;
  client_id: string | null;
}

interface Props {
  audits: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  statuses: Array<{ value: AuditStatus; label: string }>;
  tiers: Array<{ value: FinalTier; label: string }>;
  defaultStatus: string;
  defaultTier: string;
  defaultFlagged: string;
  defaultSearch: string;
}

function fmt(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

const columns: ColumnDef<AuditRow>[] = [
  {
    accessorKey: "business_name",
    header: "Business",
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-[--text-primary]">{row.original.business_name}</span>
        {row.original.flagged_for_review && (
          <AlertTriangle className="h-3.5 w-3.5 text-[--warning]" />
        )}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <AuditStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "final_tier",
    header: "Tier",
    cell: ({ row }) => <TierBadge tier={row.original.final_tier} />,
  },
  {
    accessorKey: "total_opportunity_gbp",
    header: "Opportunity",
    cell: ({ row }) => (
      <span className="tabular-nums text-right block text-[--text-primary]">
        {row.original.total_opportunity_gbp != null ? fmt(row.original.total_opportunity_gbp) : "—"}
      </span>
    ),
    size: 120,
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => (
      <span className="text-[--text-secondary]">
        {new Date(row.original.created_at).toLocaleDateString("en-GB")}
      </span>
    ),
  },
  {
    accessorKey: "audit_run_at",
    header: "Run at",
    cell: ({ row }) => (
      <span className="text-[--text-secondary]">
        {row.original.audit_run_at
          ? new Date(row.original.audit_run_at).toLocaleDateString("en-GB")
          : "—"}
      </span>
    ),
  },
];

export function AuditsTable({
  audits,
  total,
  page,
  pageSize,
  statuses,
  tiers,
  defaultStatus,
  defaultTier,
  defaultFlagged,
  defaultSearch,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [search, setSearch]   = useState(defaultSearch);
  const [status, setStatus]   = useState(defaultStatus);
  const [tier, setTier]       = useState(defaultTier);
  const [flagged, setFlagged] = useState(defaultFlagged);

  useEffect(() => {
    const t = setTimeout(() => pushParams({ search, page: 1 }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const pushParams = useCallback(
    (overrides: Record<string, string | number>) => {
      const p = new URLSearchParams();
      const merged = { page, search, status, tier, flagged, ...overrides };
      if (merged.page !== 1) p.set("page", String(merged.page));
      if (merged.search) p.set("search", merged.search as string);
      if (merged.status) p.set("status", merged.status as string);
      if (merged.tier)   p.set("tier", merged.tier as string);
      if (merged.flagged) p.set("flagged", merged.flagged as string);
      router.push(`${pathname}?${p.toString()}`);
    },
    [pathname, router, page, search, status, tier, flagged]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by business name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value); pushParams({ status: e.target.value, page: 1 }); }}
          className="w-48"
        >
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <Select
          value={tier}
          onChange={(e) => { setTier(e.target.value); pushParams({ tier: e.target.value, page: 1 }); }}
          className="w-36"
        >
          <option value="">All tiers</option>
          {tiers.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <Select
          value={flagged}
          onChange={(e) => { setFlagged(e.target.value); pushParams({ flagged: e.target.value, page: 1 }); }}
          className="w-36"
        >
          <option value="">All audits</option>
          <option value="true">Flagged only</option>
          <option value="false">Not flagged</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={audits}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={(p) => pushParams({ page: p })}
        onRowClick={(row) => router.push(`/audits/${row.id}`)}
        emptyMessage="No audits match your filters."
      />
    </div>
  );
}
