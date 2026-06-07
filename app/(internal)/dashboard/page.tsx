import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditStatusBadge, TierBadge } from "@/components/ui/badge";
import { CATEGORIES, SCORE_TO_RAG } from "@/lib/constants/categories";
import { AlertTriangle, Wifi, WifiOff, CheckCircle2 } from "lucide-react";
import type { AuditStatus, FinalTier, RAG } from "@/lib/types";

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

const STATUS_ORDER: AuditStatus[] = [
  "awaiting_questionnaire",
  "audit_running",
  "awaiting_review",
  "approved",
  "sent",
  "failed",
];

const STATUS_LABELS: Record<string, string> = {
  awaiting_questionnaire: "Awaiting Q.",
  audit_running: "Running",
  awaiting_review: "Awaiting Review",
  approved: "Approved",
  sent: "Sent",
  failed: "Failed",
};

function fmt(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-md border border-[--border] bg-[--bg-primary] px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[--text-tertiary]">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-[--text-primary]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[--text-tertiary]">{sub}</p>}
    </div>
  );
}

function SectionHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-[--text-primary]">{title}</h2>
      {href && (
        <Link href={href} className="text-xs text-[--accent] hover:underline">
          {linkLabel ?? "View all →"}
        </Link>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const service = createServiceClient();
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const day24hAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const day90Ago = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: activeCount },
    { count: awaitingCount },
    { count: sentCount },
    { data: opportunities },
    { data: flaggedAudits },
    { data: todaysCalls },
    { data: pipelineCounts },
    { data: tierCounts },
    { data: webhookHealth },
    { data: recentAudits },
    { data: recentCategories },
  ] = await Promise.all([
    // KPI: active
    service
      .from("audits")
      .select("*", { count: "exact", head: true })
      .not("status", "in", '("sent","archived","failed")')
      .is("deleted_at", null),

    // KPI: awaiting review
    service
      .from("audits")
      .select("*", { count: "exact", head: true })
      .eq("status", "awaiting_review")
      .is("deleted_at", null),

    // KPI: sent this month
    service
      .from("audits")
      .select("*", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", monthStart),

    // KPI: total opportunity
    service
      .from("audits")
      .select("total_opportunity_gbp")
      .is("deleted_at", null)
      .not("total_opportunity_gbp", "is", null)
      .limit(10000),

    // Panel A: flagged audits
    service
      .from("audits")
      .select("id, status, final_tier, total_opportunity_gbp, flag_reasons, created_at, clients(business_name)")
      .eq("flagged_for_review", true)
      .in("status", ["awaiting_review", "audit_running"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10),

    // Panel B: today's discovery calls
    service
      .from("clients")
      .select("id, business_name, owner_name, sector, phone, consent_captured")
      .eq("call_date", todayStr)
      .is("deleted_at", null)
      .order("business_name"),

    // Panel C: pipeline by status
    service
      .from("audits")
      .select("status")
      .is("deleted_at", null)
      .not("status", "in", '("archived")'),

    // Panel D: tier distribution last 90 days
    service
      .from("audits")
      .select("final_tier")
      .eq("status", "sent")
      .gte("sent_at", day90Ago)
      .not("final_tier", "is", null),

    // Panel E: webhook health last 24h
    service
      .from("webhook_logs")
      .select("direction, response_status")
      .gte("created_at", day24hAgo),

    // Panel F: recent audits (enriched)
    service
      .from("audits")
      .select("id, status, final_tier, total_opportunity_gbp, flagged_for_review, created_at, clients(business_name, sector)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10),

    // Panel F: category RAG dots for recent audits
    service
      .from("audit_categories")
      .select("audit_id, category_number, score")
      .order("category_number"),
  ]);

  const totalOpportunity = (opportunities ?? []).reduce(
    (sum, row) => sum + Number(row.total_opportunity_gbp ?? 0),
    0
  );

  // Panel C: count per status
  const statusCounts: Record<string, number> = {};
  for (const row of pipelineCounts ?? []) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
  }

  // Panel D: count per tier
  const tierDistribution: Record<string, number> = {};
  for (const row of tierCounts ?? []) {
    if (row.final_tier) tierDistribution[row.final_tier] = (tierDistribution[row.final_tier] ?? 0) + 1;
  }
  const tierMax = Math.max(1, ...Object.values(tierDistribution));

  // Panel E
  const wh = webhookHealth ?? [];
  const whOutgoing  = wh.filter((w) => w.direction === "outgoing").length;
  const whIncoming  = wh.filter((w) => w.direction === "incoming").length;
  const whFailed    = wh.filter((w) => w.response_status != null && w.response_status >= 300).length;

  // Panel F: build category RAG map keyed by audit_id
  const catMap: Record<string, Array<{ n: number; rag: RAG | null }>> = {};
  for (const cat of recentCategories ?? []) {
    if (!catMap[cat.audit_id]) catMap[cat.audit_id] = [];
    catMap[cat.audit_id].push({ n: cat.category_number, rag: SCORE_TO_RAG(cat.score) });
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-[--border] pb-4">
        <h1 className="text-xl font-semibold text-[--text-primary]">Dashboard</h1>
        <p className="mt-1 text-sm text-[--text-secondary]">Overview of all audits and activity.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Active audits"    value={activeCount ?? 0} />
        <StatCard label="Awaiting review"  value={awaitingCount ?? 0} />
        <StatCard
          label="Sent this month"
          value={sentCount ?? 0}
          sub={now.toLocaleString("en-GB", { month: "long", year: "numeric" })}
        />
        <StatCard label="Total opportunity" value={fmt(totalOpportunity)} sub="across all audits" />
      </div>

      {/* Panel A — Flagged audits */}
      <div>
        <SectionHeader title="⚠ Flagged audits" href="/audits?flagged=true" linkLabel="View all flagged →" />
        {!flaggedAudits || flaggedAudits.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-[--border] bg-[--bg-secondary] px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <p className="text-sm text-[--text-secondary]">Nothing flagged — everything&apos;s clean.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-[--border]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--border] bg-[--bg-secondary]">
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Business</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Tier</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Opportunity</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Reasons</th>
                </tr>
              </thead>
              <tbody>
                {flaggedAudits.map((audit) => {
                  const c = audit.clients as Array<{ business_name: string }> | null;
                  const name = (Array.isArray(c) ? c[0] : (c as unknown as { business_name: string } | null))?.business_name ?? "—";
                  return (
                    <tr key={audit.id} className="border-b border-[--border] last:border-0 hover:bg-[--bg-secondary]">
                      <td className="px-4 py-2.5 font-medium">
                        <Link href={`/audits/${audit.id}`} className="text-[--text-primary] hover:text-[--accent]">{name}</Link>
                      </td>
                      <td className="px-4 py-2.5"><AuditStatusBadge status={audit.status as AuditStatus} /></td>
                      <td className="px-4 py-2.5"><TierBadge tier={(audit.final_tier as FinalTier) ?? null} /></td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {audit.total_opportunity_gbp ? fmt(Number(audit.total_opportunity_gbp)) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {((audit.flag_reasons ?? []) as string[]).slice(0, 3).map((r, i) => (
                            <span key={i} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{r}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Panel B — Today's discovery calls (hidden when empty) */}
      {todaysCalls && todaysCalls.length > 0 && (
        <div>
          <SectionHeader title={`Today's discovery calls (${todaysCalls.length})`} href="/clients" />
          <div className="overflow-hidden rounded-md border border-[--border]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--border] bg-[--bg-secondary]">
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Business</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Owner</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Sector</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Phone</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Consent</th>
                </tr>
              </thead>
              <tbody>
                {todaysCalls.map((c) => (
                  <tr key={c.id} className="border-b border-[--border] last:border-0 hover:bg-[--bg-secondary]">
                    <td className="px-4 py-2.5 font-medium">
                      <Link href={`/clients/${c.id}`} className="text-[--text-primary] hover:text-[--accent]">{c.business_name}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-[--text-secondary]">{c.owner_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[--text-secondary]">{SECTOR_LABELS[c.sector ?? ""] ?? c.sector ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[--text-secondary]">{c.phone ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {c.consent_captured
                        ? <span className="text-emerald-600 font-medium">✓</span>
                        : <span className="text-[--text-tertiary]">✗</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Panel C — Pipeline by status */}
      <div>
        <SectionHeader title="Pipeline" href="/audits" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {STATUS_ORDER.map((s) => (
            <Link
              key={s}
              href={`/audits?status=${s}`}
              className="rounded-md border border-[--border] bg-[--bg-primary] px-3 py-3 text-center hover:border-[--accent] hover:bg-[--bg-secondary] transition-colors"
            >
              <p className="text-lg font-semibold tabular-nums text-[--text-primary]">{statusCounts[s] ?? 0}</p>
              <p className="mt-0.5 text-xs text-[--text-tertiary]">{STATUS_LABELS[s]}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Panel D — Tier distribution last 90 days */}
      <div>
        <SectionHeader title="Tier distribution — last 90 days" href="/audits?status=sent" />
        <div className="flex items-end gap-3 rounded-md border border-[--border] bg-[--bg-primary] px-5 py-4">
          {["Starter", "Standard", "Growth", "Established", "Enterprise"].map((tier) => {
            const count = tierDistribution[tier] ?? 0;
            const pct   = Math.round((count / tierMax) * 100);
            return (
              <div key={tier} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-semibold tabular-nums text-[--text-primary]">{count}</span>
                <div className="w-full rounded-sm bg-[--bg-secondary]" style={{ height: "80px" }}>
                  <div
                    className="w-full rounded-sm bg-[--accent] transition-all"
                    style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
                  />
                </div>
                <span className="text-xs text-[--text-tertiary]">{tier}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Panel E — Webhook health last 24h */}
      <div>
        <SectionHeader title="Webhook health — last 24h" href="/settings/health" linkLabel="Health dashboard →" />
        <div className="flex items-center gap-4 rounded-md border border-[--border] bg-[--bg-primary] px-5 py-4">
          {whFailed > 0 && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-[--danger]" />
          )}
          <div className="flex gap-6 text-sm">
            <span className="text-[--text-secondary]">
              <span className="font-semibold tabular-nums text-[--text-primary]">{whOutgoing}</span> outgoing
            </span>
            <span className="text-[--text-secondary]">
              <span className="font-semibold tabular-nums text-[--text-primary]">{whIncoming}</span> incoming
            </span>
            <span className={whFailed > 0 ? "text-[--danger]" : "text-[--text-secondary]"}>
              <span className="font-semibold tabular-nums">{whFailed}</span> {whFailed > 0 ? "failures ⚠" : "failures"}
            </span>
          </div>
          {whFailed === 0 && wh.length > 0 && (
            <div className="ml-auto flex items-center gap-1 text-xs text-emerald-600">
              <Wifi className="h-3.5 w-3.5" />
              All healthy
            </div>
          )}
          {wh.length === 0 && (
            <div className="ml-auto flex items-center gap-1 text-xs text-[--text-tertiary]">
              <WifiOff className="h-3.5 w-3.5" />
              No activity
            </div>
          )}
        </div>
      </div>

      {/* Panel F — Recent audits enriched */}
      <div>
        <SectionHeader title="Recent audits" href="/audits" />
        <div className="overflow-hidden rounded-md border border-[--border]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[--border] bg-[--bg-secondary]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Business</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Tier</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Categories</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Opportunity</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[--text-secondary]">Created</th>
              </tr>
            </thead>
            <tbody>
              {(recentAudits ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-[--text-tertiary]">
                    No audits yet. <Link href="/clients/new" className="text-[--accent] hover:underline">Create the first one →</Link>
                  </td>
                </tr>
              ) : (
                (recentAudits ?? []).map((audit) => {
                  const clientData = audit.clients as Array<{ business_name: string }> | null;
                  const client = Array.isArray(clientData) ? clientData[0] : (clientData as unknown as { business_name: string } | null);
                  const cats = catMap[audit.id] ?? [];
                  return (
                    <tr key={audit.id} className="border-b border-[--border] last:border-0 hover:bg-[--bg-secondary] cursor-pointer">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/audits/${audit.id}`} className="text-[--text-primary] hover:text-[--accent]">
                            {client?.business_name ?? "—"}
                          </Link>
                          {audit.flagged_for_review && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                        </div>
                      </td>
                      <td className="px-4 py-3"><AuditStatusBadge status={audit.status as AuditStatus} /></td>
                      <td className="px-4 py-3"><TierBadge tier={(audit.final_tier as FinalTier) ?? null} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {CATEGORIES.map((c) => {
                            const cat = cats.find((x) => x.n === c.number);
                            const rag = cat?.rag ?? null;
                            const color = rag === "GREEN"
                              ? "bg-emerald-400"
                              : rag === "AMBER"
                              ? "bg-amber-400"
                              : rag === "RED"
                              ? "bg-rose-400"
                              : "bg-[--border]";
                            return (
                              <span
                                key={c.number}
                                title={`${c.shortName}: ${rag ?? "pending"}`}
                                className={`h-2.5 w-2.5 rounded-full ${color}`}
                              />
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[--text-primary]">
                        {audit.total_opportunity_gbp ? fmt(Number(audit.total_opportunity_gbp)) : "—"}
                      </td>
                      <td className="px-4 py-3 text-[--text-secondary]">
                        {new Date(audit.created_at).toLocaleDateString("en-GB")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
