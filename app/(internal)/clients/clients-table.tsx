"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
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

  // Selection & delete state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string[]>([]);
  const [deleting, setDeleting]       = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const selectAllRef = useRef<HTMLInputElement>(null);

  // Clear selection on data change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [clients]);

  // Sync indeterminate state
  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = selectedIds.size > 0 && selectedIds.size < clients.length;
  }, [selectedIds, clients.length]);

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

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === clients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(clients.map((c) => c.id)));
    }
  }

  function startDelete(ids: string[]) {
    setDeleteTarget(ids);
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      if (deleteTarget.length === 1) {
        const res = await fetch(`/api/clients/${deleteTarget[0]}`, { method: "DELETE" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({})) as Record<string, string>;
          throw new Error(j.error ?? "Delete failed");
        }
      } else {
        const res = await fetch("/api/clients/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: deleteTarget }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({})) as Record<string, string>;
          throw new Error(j.error ?? "Delete failed");
        }
      }
      setDeleteOpen(false);
      setSelectedIds(new Set());
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const totalPages = Math.ceil(total / pageSize);
  const allSelected = clients.length > 0 && selectedIds.size === clients.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={sector}
          onChange={(e) => { setSector(e.target.value); pushParams({ sector: e.target.value, page: 1 }); }}
          className="w-48"
        >
          <option value="">All sectors</option>
          {sectors.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>

        {selectedIds.size > 0 && (
          <Button variant="danger" size="sm" onClick={() => startDelete(Array.from(selectedIds))}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete {selectedIds.size} selected
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-[--border]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[--border] bg-[--bg-secondary]">
              <th className="w-10 px-4 py-2.5">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 cursor-pointer accent-[--accent]"
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Business</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Owner</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Email</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Sector</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Audits</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Last audit</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Created</th>
              <th className="w-10 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-[--text-tertiary]">
                  {search || sector ? "No clients match your filters." : "No clients yet. Create the first one."}
                </td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-[--border] last:border-0 cursor-pointer transition-colors hover:bg-[--bg-secondary]"
                  onClick={() => router.push(`/clients/${c.id}`)}
                >
                  <td
                    className="w-10 px-4 py-3"
                    onClick={(e) => { e.stopPropagation(); toggleOne(c.id); }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleOne(c.id)}
                      className="h-3.5 w-3.5 cursor-pointer accent-[--accent]"
                      aria-label={`Select ${c.business_name}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-[--text-primary]">{c.business_name}</span>
                  </td>
                  <td className="px-4 py-3 text-[--text-secondary]">{c.owner_name ?? "—"}</td>
                  <td className="px-4 py-3 text-[--text-secondary]">{c.email}</td>
                  <td className="px-4 py-3">
                    {c.sector ? (
                      <Badge variant="neutral">{SECTOR_LABELS[c.sector] ?? c.sector}</Badge>
                    ) : (
                      <span className="text-[--text-tertiary]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[--text-secondary]">{c.audit_count}</td>
                  <td className="px-4 py-3">
                    {c.last_audit_status ? (
                      <AuditStatusBadge status={c.last_audit_status} />
                    ) : (
                      <span className="text-[--text-tertiary]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[--text-secondary]">
                    {new Date(c.created_at).toLocaleDateString("en-GB")}
                  </td>
                  <td
                    className="w-10 px-2 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => startDelete([c.id])}
                      className="rounded p-1 text-[--text-tertiary] opacity-0 hover:bg-red-50 hover:text-[--danger] transition-all [tr:hover_&]:opacity-100"
                      title="Delete client"
                      aria-label="Delete client"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[--border] px-1 pt-3 text-sm text-[--text-secondary]">
          <span>
            {total === 0 ? "No results" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => pushParams({ page: page - 1 })}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span className="px-2 text-xs">{page} / {totalPages}</span>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => pushParams({ page: page + 1 })}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title="Delete client(s)"
        size="sm"
        description={`Permanently delete ${deleteTarget.length} client${deleteTarget.length !== 1 ? "s" : ""} and all their audits? This cannot be undone.`}
      >
        {deleteError && (
          <p className="mb-3 rounded-md border border-[--danger] bg-red-50 px-3 py-2 text-sm text-[--danger]">
            {deleteError}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
          <Button variant="danger" size="sm" loading={deleting} onClick={confirmDelete}>
            Delete
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
