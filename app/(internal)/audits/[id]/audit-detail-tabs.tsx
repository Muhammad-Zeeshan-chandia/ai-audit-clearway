"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";
import { RAGBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Download, AlertTriangle, CheckCircle, Send, RefreshCw, Pencil } from "lucide-react";
import type { RAG, AuditStatus } from "@/lib/types";

interface Category {
  id: string;
  category_number: number;
  category_name: string;
  score: number | null;
  rag: RAG | null;
  confidence: number | null;
  gbp_impact_annual: number | null;
  gbp_calculation: string | null;
  evidence: string | null;
  solution_category: string | null;
  report_section: string | null;
  insufficient_data: boolean;
  used_defaults: boolean;
  contradiction_flag: boolean;
}

interface WebhookLog {
  id: string;
  direction: string;
  endpoint: string | null;
  payload: unknown;
  response_status: number | null;
  created_at: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface Questionnaire {
  data: Record<string, unknown>;
  submitted_at: string;
}

interface Client {
  id: string;
  business_name: string;
  owner_name: string | null;
  email: string;
  sector: string | null;
  shay_notes: string | null;
}

interface AuditData {
  id: string;
  status: AuditStatus;
  total_opportunity_gbp: number | null;
  final_tier: string | null;
  flagged_for_review: boolean;
  flag_reasons: string[] | null;
  created_at: string;
  questionnaire_submitted_at: string | null;
  audit_run_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  sent_at: string | null;
  transcript_path: string | null;
  pdf_path: string | null;
}

interface Props {
  audit: AuditData;
  client: Client | null;
  categories: Category[];
  questionnaire: Questionnaire | null;
  webhookLogs: WebhookLog[];
  auditLog: AuditLogEntry[];
  transcriptUrl: string | null;
  pdfUrl: string | null;
  fmt: (v: number) => string;
}

const TIMELINE_STEPS: Array<{ key: string; label: string; field: keyof AuditData }> = [
  { key: "created",       label: "Created",                  field: "created_at" },
  { key: "questionnaire", label: "Questionnaire submitted",  field: "questionnaire_submitted_at" },
  { key: "run",           label: "Audit run",                field: "audit_run_at" },
  { key: "reviewed",      label: "Reviewed",                 field: "reviewed_at" },
  { key: "sent",          label: "Sent to client",           field: "sent_at" },
];

export function AuditDetailTabs({
  audit,
  client,
  categories,
  questionnaire,
  webhookLogs,
  auditLog,
  transcriptUrl,
  pdfUrl,
  fmt,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "overview";
  const [tab, setTab] = useState(initialTab);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Review tab state
  const [approveOpen, setApproveOpen]         = useState(false);
  const [approving, setApproving]             = useState(false);
  const [changesOpen, setChangesOpen]         = useState(false);
  const [reviewNotes, setReviewNotes]         = useState("");
  const [requestingChanges, setRequestingChanges] = useState(false);
  const [editMode, setEditMode]               = useState(false);
  const [editedSections, setEditedSections]   = useState<Record<string, string>>({});
  const [savingEdits, setSavingEdits]         = useState(false);
  const [actionError, setActionError]         = useState<string | null>(null);

  async function handleApprove() {
    setApproving(true);
    setActionError(null);
    const res = await fetch(`/api/audits/${audit.id}/approve`, { method: "POST" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setActionError(j.error ?? "Approval failed.");
      setApproving(false);
      return;
    }
    setApproveOpen(false);
    router.refresh();
  }

  async function handleRequestChanges() {
    if (!reviewNotes.trim()) return;
    setRequestingChanges(true);
    setActionError(null);
    const res = await fetch(`/api/audits/${audit.id}/request-changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_notes: reviewNotes }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setActionError(j.error ?? "Request failed.");
      setRequestingChanges(false);
      return;
    }
    setChangesOpen(false);
    setReviewNotes("");
    router.refresh();
  }

  function startEdit() {
    const initial: Record<string, string> = {};
    categories.forEach((c) => { initial[c.id] = c.report_section ?? ""; });
    setEditedSections(initial);
    setEditMode(true);
  }

  async function saveEdits() {
    setSavingEdits(true);
    setActionError(null);
    const updates = categories.map((c) => ({
      id: c.id,
      category_number: c.category_number,
      report_section: editedSections[c.id] ?? c.report_section ?? "",
    }));
    const res = await fetch(`/api/audits/${audit.id}/categories`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setActionError(j.error ?? "Save failed.");
      setSavingEdits(false);
      return;
    }
    setEditMode(false);
    setSavingEdits(false);
    router.refresh();
  }

  const tabItems = [
    { key: "overview", label: "Overview" },
    { key: "inputs",   label: "Inputs" },
    { key: "results",  label: "Results", badge: categories.length || undefined },
    { key: "pdf",      label: "PDF" },
    { key: "review",   label: "Review" },
    { key: "logs",     label: "Logs" },
  ];

  return (
    <div>
      <Tabs items={tabItems} active={tab} onChange={setTab} className="mb-6" />

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Timeline */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-[--text-primary]">Timeline</h3>
            <div className="flex items-start gap-0">
              {TIMELINE_STEPS.map((step, i) => {
                const dateVal = audit[step.field] as string | null;
                const done = Boolean(dateVal);
                return (
                  <div key={step.key} className="flex flex-1 flex-col items-center">
                    <div className="flex w-full items-center">
                      {i > 0 && (
                        <div className={`h-0.5 flex-1 ${done ? "bg-[--accent]" : "bg-[--border]"}`} />
                      )}
                      <div
                        className={`h-5 w-5 shrink-0 rounded-full border-2 ${
                          done
                            ? "border-[--accent] bg-[--accent]"
                            : "border-[--border] bg-[--bg-primary]"
                        }`}
                      >
                        {done && <CheckCircle className="h-4 w-4 text-white" />}
                      </div>
                      {i < TIMELINE_STEPS.length - 1 && (
                        <div className={`h-0.5 flex-1 ${done ? "bg-[--accent]" : "bg-[--border]"}`} />
                      )}
                    </div>
                    <div className="mt-2 text-center">
                      <p className="text-xs font-medium text-[--text-primary]">{step.label}</p>
                      {dateVal && (
                        <p className="text-xs text-[--text-tertiary]">
                          {new Date(dateVal).toLocaleDateString("en-GB")}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {audit.total_opportunity_gbp != null && (
            <div className="rounded-md border border-[--border] bg-[--bg-secondary] p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[--text-tertiary]">
                Total opportunity identified
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-[--accent]">
                {fmt(Number(audit.total_opportunity_gbp))}
              </p>
              {audit.final_tier != null && (
                <p className="mt-1 text-sm text-[--text-secondary]">Tier: {audit.final_tier}</p>
              )}
            </div>
          )}

          {audit.flagged_for_review && (
            <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-800">Flagged for manual review</p>
                {(audit.flag_reasons ?? []).length > 0 && (
                  <ul className="mt-1 list-inside list-disc text-xs text-amber-700">
                    {(audit.flag_reasons ?? []).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── INPUTS ── */}
      {tab === "inputs" && (
        <div className="space-y-6 max-w-2xl">
          {/* Transcript */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[--text-primary]">Transcript</h3>
            {transcriptUrl ? (
              <a href={transcriptUrl} download>
                <Button variant="secondary" size="sm">
                  <Download className="h-3.5 w-3.5" />
                  Download transcript
                </Button>
              </a>
            ) : (
              <p className="text-sm text-[--text-tertiary]">No transcript uploaded.</p>
            )}
          </div>

          {/* Questionnaire */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[--text-primary]">Questionnaire responses</h3>
            {questionnaire ? (
              <div className="rounded-md border border-[--border] divide-y divide-[--border]">
                {Object.entries(questionnaire.data).map(([key, value]) => (
                  <div key={key} className="flex gap-4 px-4 py-2.5">
                    <p className="w-48 shrink-0 text-xs font-medium text-[--text-tertiary] truncate">{key}</p>
                    <p className="text-sm text-[--text-primary]">{String(value ?? "—")}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[--text-tertiary]">Questionnaire not submitted yet.</p>
            )}
          </div>

          {/* Shay notes */}
          {client?.shay_notes && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-[--text-primary]">Discovery call notes</h3>
              <div className="rounded-md border border-[--border] bg-[--bg-secondary] px-4 py-3 text-sm text-[--text-primary] whitespace-pre-wrap">
                {client.shay_notes}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── RESULTS ── */}
      {tab === "results" && (
        <div>
          {categories.length === 0 ? (
            <p className="text-sm text-[--text-tertiary]">
              Results will appear here once the audit engine has run.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="rounded-md border border-[--border] bg-[--bg-primary] p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[--text-tertiary]">
                        Category {cat.category_number}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-[--text-primary]">
                        {cat.category_name}
                      </p>
                    </div>
                    {cat.rag && <RAGBadge rag={cat.rag} />}
                  </div>

                  <div className="mt-3 flex items-center gap-4 text-sm">
                    {cat.score != null && (
                      <div>
                        <span className="text-xs text-[--text-tertiary]">Score </span>
                        <span className="font-semibold">{cat.score}/5</span>
                      </div>
                    )}
                    {cat.confidence != null && (
                      <div>
                        <span className="text-xs text-[--text-tertiary]">Confidence </span>
                        <span className="font-semibold">{cat.confidence}%</span>
                      </div>
                    )}
                  </div>

                  {cat.gbp_impact_annual != null && (
                    <p className="mt-2 text-base font-semibold tabular-nums text-[--accent]">
                      {fmt(Number(cat.gbp_impact_annual))} / yr
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1">
                    {cat.insufficient_data  && <Badge variant="warning">Insufficient data</Badge>}
                    {cat.used_defaults      && <Badge variant="neutral">Used defaults</Badge>}
                    {cat.contradiction_flag && <Badge variant="danger">Contradiction</Badge>}
                  </div>

                  {/* Evidence preview */}
                  {cat.evidence && (
                    <p className="mt-2 line-clamp-2 text-xs text-[--text-secondary]">
                      {cat.evidence}
                    </p>
                  )}

                  <button
                    className="mt-2 text-xs text-[--accent] hover:underline"
                    onClick={() =>
                      setExpandedCategory(expandedCategory === cat.id ? null : cat.id)
                    }
                  >
                    {expandedCategory === cat.id ? "Hide report section" : "Show report section"}
                  </button>

                  {expandedCategory === cat.id && cat.report_section && (
                    <div className="mt-2 rounded border border-[--border] bg-[--bg-secondary] p-3 text-xs text-[--text-primary] whitespace-pre-wrap">
                      {cat.report_section}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PDF ── */}
      {tab === "pdf" && (
        <div>
          {pdfUrl ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <a href={pdfUrl} download>
                  <Button variant="secondary" size="sm">
                    <Download className="h-3.5 w-3.5" />
                    Download PDF
                  </Button>
                </a>
              </div>
              <div className="h-[700px] w-full overflow-hidden rounded-md border border-[--border]">
                <iframe
                  src={pdfUrl}
                  className="h-full w-full"
                  title="Audit PDF"
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-[--text-tertiary]">
              PDF will appear here once the audit is complete and approved.
            </p>
          )}
        </div>
      )}

      {/* ── REVIEW ── */}
      {tab === "review" && (
        <div className="max-w-2xl space-y-5">
          {actionError && (
            <div className="rounded-md border border-[--danger] bg-red-50 px-4 py-3 text-sm text-[--danger]">
              {actionError}
            </div>
          )}

          {/* Actions (only when awaiting_review) */}
          {audit.status === "awaiting_review" && !editMode && (
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" size="md" onClick={() => setApproveOpen(true)}>
                <Send className="h-4 w-4" />
                Approve &amp; Send
              </Button>
              <Button variant="secondary" size="md" onClick={() => setChangesOpen(true)}>
                <RefreshCw className="h-4 w-4" />
                Request changes
              </Button>
              {categories.length > 0 && (
                <Button variant="ghost" size="md" onClick={startEdit}>
                  <Pencil className="h-4 w-4" />
                  Edit report sections
                </Button>
              )}
            </div>
          )}

          {/* Inline editor */}
          {editMode && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[--text-primary]">Edit report sections</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditMode(false)} disabled={savingEdits}>Cancel</Button>
                  <Button variant="primary" size="sm" loading={savingEdits} onClick={saveEdits}>
                    Save &amp; regenerate PDF
                  </Button>
                </div>
              </div>
              {categories.map((cat) => (
                <div key={cat.id} className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[--text-tertiary]">
                    {cat.category_number}. {cat.category_name}
                  </p>
                  <Textarea
                    rows={5}
                    value={editedSections[cat.id] ?? cat.report_section ?? ""}
                    onChange={(e) => setEditedSections({ ...editedSections, [cat.id]: e.target.value })}
                    disabled={savingEdits}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Sent confirmation */}
          {audit.status === "sent" && (
            <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-medium text-emerald-800">Audit approved and sent</p>
                {audit.sent_at && (
                  <p className="text-xs text-emerald-700">
                    Sent {new Date(audit.sent_at).toLocaleString("en-GB")}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Review notes */}
          {audit.review_notes != null && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-[--text-primary]">Review notes</h3>
              <div className="rounded-md border border-[--border] bg-[--bg-secondary] px-4 py-3 text-sm text-[--text-primary] whitespace-pre-wrap">
                {audit.review_notes}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Approve confirm modal */}
      <Dialog open={approveOpen} onClose={() => setApproveOpen(false)} title="Approve & Send" size="sm"
        description="The PDF will be emailed to the client and the audit marked as Sent. This cannot be undone.">
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setApproveOpen(false)} disabled={approving}>Cancel</Button>
          <Button variant="primary" size="sm" loading={approving} onClick={handleApprove}>
            Confirm &amp; Send
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Request changes modal */}
      <Dialog open={changesOpen} onClose={() => setChangesOpen(false)} title="Request changes" size="md"
        description="Describe what needs to change. The audit engine will re-run with this feedback.">
        <div className="space-y-3">
          <Textarea
            rows={4}
            placeholder="e.g. The Lead Capture score seems too low — the client mentioned 80% close rate which wasn't reflected..."
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            disabled={requestingChanges}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setChangesOpen(false)} disabled={requestingChanges}>Cancel</Button>
          <Button variant="primary" size="sm" loading={requestingChanges} onClick={handleRequestChanges} disabled={!reviewNotes.trim()}>
            Submit &amp; re-run
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── LOGS ── */}
      {tab === "logs" && (
        <div className="space-y-6">
          {/* Webhook logs */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[--text-primary]">Webhook logs</h3>
            {webhookLogs.length === 0 ? (
              <p className="text-sm text-[--text-tertiary]">No webhook logs.</p>
            ) : (
              <div className="overflow-hidden rounded-md border border-[--border]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[--border] bg-[--bg-secondary]">
                      <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">Direction</th>
                      <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">Endpoint</th>
                      <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">Status</th>
                      <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhookLogs.map((log) => (
                      <tr key={log.id} className="border-b border-[--border] last:border-0">
                        <td className="px-3 py-2">
                          <Badge variant={log.direction === "outgoing" ? "accent" : "neutral"}>
                            {log.direction}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-[--text-secondary] truncate max-w-[200px]">
                          {log.endpoint ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {log.response_status != null && (
                            <Badge variant={log.response_status < 300 ? "success" : "danger"}>
                              {log.response_status}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[--text-tertiary]">
                          {new Date(log.created_at).toLocaleString("en-GB")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Audit log */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[--text-primary]">Audit trail</h3>
            {auditLog.length === 0 ? (
              <p className="text-sm text-[--text-tertiary]">No audit trail entries.</p>
            ) : (
              <div className="space-y-1">
                {auditLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 border-b border-[--border] py-2 last:border-0"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[--accent]" />
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-xs text-[--accent]">{entry.action}</span>
                      <span className="ml-2 text-xs text-[--text-tertiary]">
                        {new Date(entry.created_at).toLocaleString("en-GB")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
