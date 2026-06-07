"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/tables/data-table";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AuditStatusBadge, Badge } from "@/components/ui/badge";
import type { AuditStatus } from "@/lib/types";

interface ClientRow {
  id: string;
  email: string;
  business_name: string;
  owner_name: string | null;
  sector: string | null;
  created_at: string;
  audit_count: number;
  last_audit_status: AuditStatus | null;
}

interface Props {
  clients: ClientRow[];
  total: number;
  page: number;
  pageSize: number;
  sectors: Array<{ value: string; label: string }>;
  defaultSearch: string;
  defaultSector: string;
}

const SECTOR_LABELS: Record<string, string> = {
  restaurant: "Restaurant",
  clinic_dental: "Dental / Clinic",
  trades: "Trades",
  agency_consultancy: "Agency / Consultancy",
  retail_ecommerce: "Retail / eCommerce",
  gym_fitness: "Gym / Fitness",
  salon_beauty: "Salon / Beauty",
  hotel_hospitality: "Hotel / Hospitality",
  other: "Other",
};

const columns: ColumnDef<ClientRow>[] = [
  {
    accessorKey: "business_name",
    header: "Business",
    cell: ({ row }) => (
      <span className="font-medium text-[--text-primary]">{row.original.business_name}</span>
    ),
  },
  {
    accessorKey: "owner_name",
    header: "Owner",
    cell: ({ row }) => (
      <span className="text-[--text-secondary]">{row.original.owner_name ?? "—"}</span>
    ),
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <span className="text-[--text-secondary]">{row.original.email}</span>
    ),
  },
  {
    accessorKey: "sector",
    header: "Sector",
    cell: ({ row }) =>
      row.original.sector ? (
        <Badge variant="neutral">{SECTOR_LABELS[row.original.sector] ?? row.original.sector}</Badge>
      ) : (
        <span className="text-[--text-tertiary]">—</span>
      ),
  },
  {
    accessorKey: "audit_count",
    header: "Audits",
    cell: ({ row }) => (
      <span className="tabular-nums text-[--text-secondary]">{row.original.audit_count}</span>
    ),
  },
  {
    accessorKey: "last_audit_status",
    header: "Last audit",
    cell: ({ row }) =>
      row.original.last_audit_status ? (
        <AuditStatusBadge status={row.original.last_audit_status} />
      ) : (
        <span className="text-[--text-tertiary]">—</span>
      ),
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
];

export function ClientsTable({
  clients,
  total,
  page,
  pageSize,
  sectors,
  defaultSearch,
  defaultSector,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [search, setSearch] = useState(defaultSearch);
  const [sector, setSector] = useState(defaultSector);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => pushParams({ search, sector, page: 1 }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const pushParams = useCallback(
    (overrides: Record<string, string | number>) => {
      const p = new URLSearchParams();
      const merged = { page, search, sector, ...overrides };
      if (merged.page !== 1) p.set("page", String(merged.page));
      if (merged.search) p.set("search", merged.search as string);
      if (merged.sector) p.set("sector", merged.sector as string);
      router.push(`${pathname}?${p.toString()}`);
    },
    [pathname, router, page, search, sector]
  );

  function handleSectorChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSector(e.target.value);
    pushParams({ sector: e.target.value, page: 1 });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={sector}
          onChange={handleSectorChange}
          className="w-48"
        >
          <option value="">All sectors</option>
          {sectors.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={clients}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={(p) => pushParams({ page: p })}
        onRowClick={(row) => router.push(`/clients/${row.id}`)}
        emptyMessage={search || sector ? "No clients match your filters." : "No clients yet. Create the first one."}
      />
    </div>
  );
}
