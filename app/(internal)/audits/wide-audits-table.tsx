"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Download, Columns3, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AuditStatusBadge, TierBadge } from "@/components/ui/badge";
import { SCORE_TO_RAG } from "@/lib/constants/categories";
import type { AuditStatus, FinalTier } from "@/lib/types";

interface AuditWideRow {
  audit_id: string;
  client_id: string;
  status: AuditStatus;
  created_at: string;
  questionnaire_submitted_at: string | null;
  audit_run_at: string | null;
  total_opportunity_gbp: number | null;
  audit_size_score: number | null;
  final_tier: FinalTier | null;
  tier_overridden: boolean;
  flagged_for_review: boolean;
  reviewed_by: string | null;
  review_notes: string | null;
  sent_at: string | null;
  pdf_path: string | null;
  business_name: string;
  owner_name: string | null;
  client_email: string;
  phone: string | null;
  sector: string | null;
  call_date: string | null;
  consent_captured: boolean;
  staff_count: string | null;
  sites_count: string | null;
  main_challenge: string | null;
  c1_score: number | null; c1_gbp: number | null;
  c2_score: number | null; c2_gbp: number | null;
  c3_score: number | null; c3_gbp: number | null;
  c4_score: number | null; c4_gbp: number | null;
  c5_score: number | null; c5_gbp: number | null;
  c6_score: number | null; c6_gbp: number | null;
}

interface Props {
  audits: AuditWideRow[];
  total: number;
  page: number;
  pageSize: number;
  statuses: Array<{ value: AuditStatus; label: string }>;
  tiers: Array<{ value: FinalTier; label: string }>;
  sectors: Array<{ value: string; label: string }>;
  categories: Array<{ number: number; shortName: string; name: string }>;
  defaultStatus: string;
  defaultTier: string;
  defaultSector: string;
  defaultFlagged: string;
  defaultSearch: string;
  exportUrl: string;
}

const ALL_COLUMNS = [
  "business", "owner", "email", "phone", "sector", "call_date", "consent",
  "status", "created", "q_submitted", "staff", "sites", "biggest_pain",
  "c1_score", "c1_gbp", "c2_score", "c2_gbp",
  "c3_score", "c3_gbp", "c4_score", "c4_gbp",
  "c5_score", "c5_gbp", "c6_score", "c6_gbp",
  "total_gbp", "size", "tier", "audit_run", "reviewed_by", "review_notes", "sent", "flagged",
] as const;

type ColKey = typeof ALL_COLUMNS[number];

const DEFAULT_VISIBLE: ColKey[] = [
  "business", "owner", "sector", "status", "created",
  "c1_score", "c2_score", "c3_score", "c4_score", "c5_score", "c6_score",
  "total_gbp", "tier", "flagged",
];

const COL_LABELS: Record<ColKey, string> = {
  business: "Business", owner: "Owner", email: "Email", phone: "Phone",
  sector: "Sector", call_date: "Call Date", consent: "Consent",
  status: "Status", created: "Created", q_submitted: "Q.Submitted",
  staff: "Staff", sites: "Sites", biggest_pain: "Biggest Pain",
  c1_score: "C1 Score", c1_gbp: "C1 £",
  c2_score: "C2 Score", c2_gbp: "C2 £",
  c3_score: "C3 Score", c3_gbp: "C3 £",
  c4_score: "C4 Score", c4_gbp: "C4 £",
  c5_score: "C5 Score", c5_gbp: "C5 £",
  c6_score: "C6 Score", c6_gbp: "C6 £",
  total_gbp: "Total £", size: "Size", tier: "Tier",
  audit_run: "Audit Run", reviewed_by: "Reviewer", review_notes: "Notes",
  sent: "Sent", flagged: "Flagged",
};

const SECTOR_LABELS: Record<string, string> = {
  restaurant: "Restaurant", clinic_dental: "Dental", trades: "Trades",
  agency_consultancy: "Agency", retail_ecommerce: "Retail", gym_fitness: "Gym",
  salon_beauty: "Salon", hotel_hospitality: "Hotel", other: "Other",
};

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-GB");
}

function fmtGbp(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(v);
}

function ScoreDot({ score }: { score: number | null }) {
  if (score == null) return <span className="text-[--text-tertiary]">—</span>;
  const rag = SCORE_TO_RAG(score);
  const color = rag === "GREEN" ? "text-emerald-600" : rag === "AMBER" ? "text-amber-600" : "text-rose-600";
  return <span className={`font-semibold tabular-nums ${color}`}>{score}</span>;
}

const STORAGE_KEY = "clearway:audits-col-visibility";

export function WideAuditsTable({
  audits, total, page, pageSize,
  statuses, tiers, sectors,
  defaultStatus, defaultTier, defaultSector, defaultFlagged, defaultSearch,
  exportUrl,
}: Props) {
  const router   = useRouter();
  const pathname = usePathname();

  const [search,  setSearch]  = useState(defaultSearch);
  const [status,  setStatus]  = useState(defaultStatus);
  const [tier,    setTier]    = useState(defaultTier);
  const [sector,  setSector]  = useState(defaultSector);
  const [flagged, setFlagged] = useState(defaultFlagged);
  const [showColPicker, setShowColPicker] = useState(false);
  const [visibleCols, setVisibleCols] = useState<ColKey[]>(DEFAULT_VISIBLE);

  // Load column visibility from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setVisibleCols(JSON.parse(saved) as ColKey[]);
    } catch {}
  }, []);

  function toggleCol(col: ColKey) {
    setVisibleCols((prev) => {
      const next = prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  useEffect(() => {
    const t = setTimeout(() => pushParams({ search, page: 1 }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const pushParams = useCallback(
    (overrides: Record<string, string | number>) => {
      const p = new URLSearchParams();
      const merged = { page, search, status, tier, sector, flagged, ...overrides };
      if (merged.page !== 1)  p.set("page", String(merged.page));
      if (merged.search)      p.set("search",  merged.search as string);
      if (merged.status)      p.set("status",  merged.status as string);
      if (merged.tier)        p.set("tier",    merged.tier as string);
      if (merged.sector)      p.set("sector",  merged.sector as string);
      if (merged.flagged)     p.set("flagged", merged.flagged as string);
      router.push(`${pathname}?${p.toString()}`);
    },
    [pathname, router, page, search, status, tier, sector, flagged]
  );

  const totalPages = Math.ceil(total / pageSize);
  const vis = new Set(visibleCols);

  function th(label: string) {
    return (
      <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">
        {label}
      </th>
    );
  }

  function td(children: React.ReactNode, className = "") {
    return <td className={`px-3 py-2.5 text-sm ${className}`}>{children}</td>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search business, owner, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); pushParams({ status: e.target.value, page: 1 }); }} className="w-44">
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <Select value={tier} onChange={(e) => { setTier(e.target.value); pushParams({ tier: e.target.value, page: 1 }); }} className="w-32">
          <option value="">All tiers</option>
          {tiers.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <Select value={sector} onChange={(e) => { setSector(e.target.value); pushParams({ sector: e.target.value, page: 1 }); }} className="w-36">
          <option value="">All sectors</option>
          {sectors.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <Select value={flagged} onChange={(e) => { setFlagged(e.target.value); pushParams({ flagged: e.target.value, page: 1 }); }} className="w-36">
          <option value="">All audits</option>
          <option value="true">Flagged only</option>
          <option value="false">Not flagged</option>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          {/* Column visibility */}
          <div className="relative">
            <Button variant="ghost" size="sm" onClick={() => setShowColPicker(!showColPicker)}>
              <Columns3 className="h-4 w-4" />
              Columns
            </Button>
            {showColPicker && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-[--border] bg-[--bg-primary] shadow-lg">
                <div className="max-h-72 overflow-y-auto p-2">
                  {ALL_COLUMNS.map((col) => (
                    <label key={col} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-[--bg-secondary]">
                      <input
                        type="checkbox"
                        checked={vis.has(col)}
                        onChange={() => toggleCol(col)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-xs text-[--text-primary]">{COL_LABELS[col]}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Export CSV */}
          <a href={exportUrl} download>
            <Button variant="secondary" size="sm">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </a>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-[--border]">
        <table className="w-max min-w-full text-sm">
          <thead className="border-b border-[--border] bg-[--bg-secondary]">
            <tr>
              {vis.has("business")     && th("Business")}
              {vis.has("owner")        && th("Owner")}
              {vis.has("email")        && th("Email")}
              {vis.has("phone")        && th("Phone")}
              {vis.has("sector")       && th("Sector")}
              {vis.has("call_date")    && th("Call Date")}
              {vis.has("consent")      && th("Consent")}
              {vis.has("status")       && th("Status")}
              {vis.has("created")      && th("Created")}
              {vis.has("q_submitted")  && th("Q.Submitted")}
              {vis.has("staff")        && th("Staff")}
              {vis.has("sites")        && th("Sites")}
              {vis.has("biggest_pain") && th("Biggest Pain")}
              {vis.has("c1_score") && th("C1 Score")}
              {vis.has("c1_gbp")   && th("C1 £")}
              {vis.has("c2_score") && th("C2 Score")}
              {vis.has("c2_gbp")   && th("C2 £")}
              {vis.has("c3_score") && th("C3 Score")}
              {vis.has("c3_gbp")   && th("C3 £")}
              {vis.has("c4_score") && th("C4 Score")}
              {vis.has("c4_gbp")   && th("C4 £")}
              {vis.has("c5_score") && th("C5 Score")}
              {vis.has("c5_gbp")   && th("C5 £")}
              {vis.has("c6_score") && th("C6 Score")}
              {vis.has("c6_gbp")   && th("C6 £")}
              {vis.has("total_gbp")    && th("Total £")}
              {vis.has("size")         && th("Size")}
              {vis.has("tier")         && th("Tier")}
              {vis.has("audit_run")    && th("Audit Run")}
              {vis.has("reviewed_by")  && th("Reviewer")}
              {vis.has("review_notes") && th("Notes")}
              {vis.has("sent")         && th("Sent")}
              {vis.has("flagged")      && th("Flag")}
            </tr>
          </thead>
          <tbody>
            {audits.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length + 1} className="px-4 py-8 text-center text-sm text-[--text-tertiary]">
                  No audits match your filters.
                </td>
              </tr>
            ) : (
              audits.map((a) => (
                <tr
                  key={a.audit_id}
                  className="border-b border-[--border] last:border-0 hover:bg-[--bg-secondary] transition-colors"
                >
                  {vis.has("business") && td(
                    <Link href={`/audits/${a.audit_id}`} className="font-medium text-[--text-primary] hover:text-[--accent] whitespace-nowrap flex items-center gap-1">
                      {a.business_name}
                      {a.flagged_for_review && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                    </Link>
                  )}
                  {vis.has("owner")        && td(<span className="whitespace-nowrap text-[--text-secondary]">{a.owner_name ?? "—"}</span>)}
                  {vis.has("email")        && td(<span className="whitespace-nowrap text-[--text-secondary]">{a.client_email}</span>)}
                  {vis.has("phone")        && td(<span className="whitespace-nowrap text-[--text-secondary]">{a.phone ?? "—"}</span>)}
                  {vis.has("sector")       && td(<span className="whitespace-nowrap text-[--text-secondary]">{SECTOR_LABELS[a.sector ?? ""] ?? a.sector ?? "—"}</span>)}
                  {vis.has("call_date")    && td(<span className="whitespace-nowrap text-[--text-secondary]">{fmtDate(a.call_date)}</span>)}
                  {vis.has("consent")      && td(<span className={a.consent_captured ? "text-emerald-600 font-medium" : "text-[--text-tertiary]"}>{a.consent_captured ? "✓" : "✗"}</span>)}
                  {vis.has("status")       && td(<AuditStatusBadge status={a.status} />)}
                  {vis.has("created")      && td(<span className="whitespace-nowrap text-[--text-secondary]">{fmtDate(a.created_at)}</span>)}
                  {vis.has("q_submitted")  && td(<span className="whitespace-nowrap text-[--text-secondary]">{fmtDate(a.questionnaire_submitted_at)}</span>)}
                  {vis.has("staff")        && td(<span className="text-[--text-secondary]">{a.staff_count ?? "—"}</span>)}
                  {vis.has("sites")        && td(<span className="text-[--text-secondary]">{a.sites_count ?? "—"}</span>)}
                  {vis.has("biggest_pain") && td(
                    <span className="max-w-[160px] block truncate text-[--text-secondary]" title={a.main_challenge ?? ""}>
                      {a.main_challenge ?? "—"}
                    </span>
                  )}
                  {vis.has("c1_score") && td(<ScoreDot score={a.c1_score} />)}
                  {vis.has("c1_gbp")   && td(<span className="whitespace-nowrap tabular-nums text-[--text-secondary]">{fmtGbp(a.c1_gbp)}</span>)}
                  {vis.has("c2_score") && td(<ScoreDot score={a.c2_score} />)}
                  {vis.has("c2_gbp")   && td(<span className="whitespace-nowrap tabular-nums text-[--text-secondary]">{fmtGbp(a.c2_gbp)}</span>)}
                  {vis.has("c3_score") && td(<ScoreDot score={a.c3_score} />)}
                  {vis.has("c3_gbp")   && td(<span className="whitespace-nowrap tabular-nums text-[--text-secondary]">{fmtGbp(a.c3_gbp)}</span>)}
                  {vis.has("c4_score") && td(<ScoreDot score={a.c4_score} />)}
                  {vis.has("c4_gbp")   && td(<span className="whitespace-nowrap tabular-nums text-[--text-secondary]">{fmtGbp(a.c4_gbp)}</span>)}
                  {vis.has("c5_score") && td(<ScoreDot score={a.c5_score} />)}
                  {vis.has("c5_gbp")   && td(<span className="whitespace-nowrap tabular-nums text-[--text-secondary]">{fmtGbp(a.c5_gbp)}</span>)}
                  {vis.has("c6_score") && td(<ScoreDot score={a.c6_score} />)}
                  {vis.has("c6_gbp")   && td(<span className="whitespace-nowrap tabular-nums text-[--text-secondary]">{fmtGbp(a.c6_gbp)}</span>)}
                  {vis.has("total_gbp")    && td(<span className="whitespace-nowrap font-semibold tabular-nums text-[--text-primary]">{fmtGbp(a.total_opportunity_gbp)}</span>)}
                  {vis.has("size")         && td(<span className="tabular-nums text-[--text-secondary]">{a.audit_size_score ?? "—"}</span>)}
                  {vis.has("tier")         && td(
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <TierBadge tier={a.final_tier} />
                      {a.tier_overridden && <span title="Staff override" className="text-xs text-amber-500">⚠</span>}
                    </span>
                  )}
                  {vis.has("audit_run")    && td(<span className="whitespace-nowrap text-[--text-secondary]">{fmtDate(a.audit_run_at)}</span>)}
                  {vis.has("reviewed_by")  && td(<span className="text-[--text-secondary]">{a.reviewed_by ? "✓" : "—"}</span>)}
                  {vis.has("review_notes") && td(
                    <span className="max-w-[140px] block truncate text-[--text-secondary]" title={a.review_notes ?? ""}>
                      {a.review_notes ?? "—"}
                    </span>
                  )}
                  {vis.has("sent")         && td(<span className="whitespace-nowrap text-[--text-secondary]">{fmtDate(a.sent_at)}</span>)}
                  {vis.has("flagged")      && td(
                    a.flagged_for_review
                      ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      : <span className="text-[--text-tertiary]">—</span>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-[--text-secondary]">
        <span>{total} total — page {page} of {Math.max(1, totalPages)}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost" size="sm"
            disabled={page <= 1}
            onClick={() => pushParams({ page: page - 1 })}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <Button
            variant="ghost" size="sm"
            disabled={page >= totalPages}
            onClick={() => pushParams({ page: page + 1 })}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
