"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, CheckCircle, Send, RefreshCw, FileText,
  Download, ChevronDown, Save, ExternalLink, ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { AuditStatusBadge, Badge } from "@/components/ui/badge";
import { CATEGORIES, SCORE_TO_RAG, RAG_COLORS, TIERS } from "@/lib/constants/categories";
import type { AuditStatus, RAG, FieldDefinition, DiscoveryCall } from "@/lib/types";

function fmt(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

interface AuditProp {
  id: string;
  status: AuditStatus;
  total_opportunity_gbp: number | null;
  final_tier: string | null;
  tier_overridden: boolean;
  audit_size_score: number | null;
  flagged_for_review: boolean;
  flag_reasons: string[];
  executive_summary: string | null;
  created_at: string;
  questionnaire_submitted_at: string | null;
  audit_run_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  sent_at: string | null;
  transcript_path: string | null;
  pdf_path: string | null;
  client_id: string;
  is_current: boolean;
  rebuild_count: number;
  run_stage: "initial" | "final";
}

interface FollowupAnswerRow {
  id: string;
  category_number: number | null;
  question_text: string;
  answer_text: string;
  submitted_at: string;
}

type AuditVersion = {
  id: string;
  status: string;
  is_current: boolean;
  rebuild_count: number;
  created_at: string;
};

type ClientFollowupRow = {
  id: string;
  response_text: string;
  source: "email_form" | "manual";
  submitted_at: string;
  submitted_by_user_id: string | null;
  users: { email: string } | null;
};

interface CategoryProp {
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
  missing_questions: string[] | null;
}

interface Props {
  audit: AuditProp;
  client: Record<string, unknown> | null;
  categories: CategoryProp[];
  questionnaire: { data: Record<string, unknown>; submitted_at: string } | null;
  webhookLogs: Array<{ id: string; direction: string; endpoint: string | null; response_status: number | null; created_at: string }>;
  transcriptUrl: string | null;
  pdfUrl: string | null;
  clientFields: FieldDefinition[];
  questionnaireFields: FieldDefinition[];
  discoveryCall: DiscoveryCall | null;
  clientFollowups: ClientFollowupRow[];
  followupAnswers: FollowupAnswerRow[];
  siblingAudits: AuditVersion[];
  proposal: { id: string; status: string } | null;
}

const STATUS_STEPS: Array<{ key: string; label: string; field: keyof AuditProp }> = [
  { key: "created",  label: "Created",           field: "created_at"                },
  { key: "q",        label: "Q. Submitted",       field: "questionnaire_submitted_at" },
  { key: "running",  label: "Running",            field: "audit_run_at"               },
  { key: "reviewed", label: "Awaiting Review",    field: "reviewed_at"                },
  { key: "sent",     label: "Sent",               field: "sent_at"                    },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 border-b border-[--border] pb-2 text-sm font-semibold text-[--text-primary]">
      {children}
    </h2>
  );
}

function SaveButton({ loading, onClick, label = "Save" }: { loading: boolean; onClick: () => void; label?: string }) {
  return (
    <Button variant="secondary" size="sm" loading={loading} onClick={onClick}>
      <Save className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

function DCField({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === "") return null;
  return (
    <div>
      <p className="text-xs font-medium text-[--text-tertiary]">{label}</p>
      <p className="mt-0.5 text-sm text-[--text-primary]">{children}</p>
    </div>
  );
}

const TURNOVER_LABELS: Record<string, string> = {
  "100k": "£100k",
  "500k": "£500k",
  "1m":   "£1m",
  "5m_plus": "£5m+",
};

// Inline field renderer for client/questionnaire based on FieldDefinition type
function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const strVal = value == null ? "" : String(value);
  if (field.field_type === "long_text") {
    return (
      <Textarea
        rows={3}
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={field.help_text ?? ""}
      />
    );
  }
  if (field.field_type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 accent-[--accent]"
      />
    );
  }
  if (field.field_type === "select" && field.options) {
    return (
      <select
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-md border border-[--border] bg-[--bg-primary] px-3 py-2 text-sm text-[--text-primary] focus:outline-none focus:ring-2 focus:ring-[--accent]"
      >
        <option value="">—</option>
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  if (field.field_type === "number") {
    return (
      <Input
        type="number"
        value={strVal}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        disabled={disabled}
        placeholder={field.help_text ?? ""}
      />
    );
  }
  if (field.field_type === "date") {
    return (
      <Input
        type="date"
        value={strVal}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
      />
    );
  }
  return (
    <Input
      type={field.field_type === "email" ? "email" : "text"}
      value={strVal}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={field.help_text ?? ""}
    />
  );
}

export function AuditEditor({
  audit: initialAudit,
  client: initialClient,
  categories: initialCategories,
  questionnaire: initialQuestionnaire,
  webhookLogs,
  transcriptUrl,
  pdfUrl,
  clientFields,
  questionnaireFields,
  discoveryCall,
  clientFollowups,
  followupAnswers,
  siblingAudits,
  proposal,
}: Props) {
  const router = useRouter();

  // Top-level audit state
  const [audit, setAudit]         = useState(initialAudit);
  const [tierOpen, setTierOpen]   = useState(false);
  const [tierSaving, setTierSaving] = useState(false);

  // Executive summary
  const [execSummary, setExecSummary]       = useState(initialAudit.executive_summary ?? "");
  const [execSaving, setExecSaving]         = useState(false);

  // Review notes
  const [reviewNotes, setReviewNotes]       = useState(initialAudit.review_notes ?? "");
  const [notesSaving, setNotesSaving]       = useState(false);

  // Client fields
  const [clientData, setClientData]         = useState<Record<string, unknown>>(
    (initialClient ?? {}) as Record<string, unknown>
  );
  const [clientSaving, setClientSaving]     = useState(false);

  // Questionnaire fields
  const [qData, setQData]                   = useState<Record<string, unknown>>(
    initialQuestionnaire?.data ?? {}
  );
  const [qSaving, setQSaving]               = useState(false);

  // Category cards state (keyed by category_number)
  const [catData, setCatData] = useState<Record<number, CategoryProp>>(
    Object.fromEntries(initialCategories.map((c) => [c.category_number, { ...c }]))
  );
  const [catSaving, setCatSaving] = useState<Record<number, boolean>>({});

  // Action state
  const [approveOpen, setApproveOpen]   = useState(false);
  const [approving, setApproving]       = useState(false);
  const [askingQuestions, setAskingQuestions] = useState(false);
  const [runningFinal, setRunningFinal] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [actionError, setActionError]             = useState<string | null>(null);
  const [actionMessage, setActionMessage]           = useState<string | null>(null);
  const [sendingQuestionnaire, setSendingQuestionnaire] = useState(false);
  const [buildingProposal, setBuildingProposal]     = useState(false);

  // ── Tier override ──
  async function handleTierChange(newTier: string) {
    setTierSaving(true);
    const res = await fetch(`/api/audits/${audit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ final_tier: newTier, tier_overridden: true }),
    });
    setTierSaving(false);
    setTierOpen(false);
    if (res.ok) {
      setAudit((a) => ({ ...a, final_tier: newTier, tier_overridden: true }));
    }
  }

  // ── Executive summary ──
  async function saveExecSummary() {
    setExecSaving(true);
    await fetch(`/api/audits/${audit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executive_summary: execSummary }),
    });
    setExecSaving(false);
  }

  // ── Review notes ──
  async function saveReviewNotes() {
    setNotesSaving(true);
    await fetch(`/api/audits/${audit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_notes: reviewNotes }),
    });
    setNotesSaving(false);
  }

  // ── Client fields ──
  async function saveClientData() {
    setClientSaving(true);
    await fetch(`/api/clients/${audit.client_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clientData),
    });
    setClientSaving(false);
  }

  // ── Questionnaire ──
  async function saveQuestionnaire() {
    setQSaving(true);
    await fetch(`/api/questionnaires/${audit.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionnaire_data: qData,
        client_meta: {
          business_name: clientData.business_name ?? "",
          sector: clientData.sector ?? null,
          owner_name: clientData.owner_name ?? null,
        },
      }),
    });
    setQSaving(false);
  }

  // ── Category card ──
  async function saveCategoryCard(num: number) {
    const cat = catData[num];
    if (!cat) return;
    setCatSaving((p) => ({ ...p, [num]: true }));
    await fetch(`/api/audits/${audit.id}/categories`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: [{
          category_number:   num,
          score:             cat.score,
          confidence:        cat.confidence,
          gbp_impact_annual: cat.gbp_impact_annual,
          gbp_calculation:   cat.gbp_calculation,
          evidence:          cat.evidence,
          solution_category: cat.solution_category,
          report_section:    cat.report_section,
          insufficient_data:  cat.insufficient_data,
          used_defaults:     cat.used_defaults,
          contradiction_flag: cat.contradiction_flag,
        }],
      }),
    });
    // Update local RAG from score
    setCatData((prev) => ({
      ...prev,
      [num]: { ...prev[num], rag: SCORE_TO_RAG(cat.score) },
    }));
    setCatSaving((p) => ({ ...p, [num]: false }));
  }

  function updateCat(num: number, field: keyof CategoryProp, value: unknown) {
    setCatData((prev) => ({ ...prev, [num]: { ...prev[num], [field]: value } }));
  }

  // ── Approve & Send ──
  async function handleApprove() {
    setApproving(true);
    setActionError(null);
    const res = await fetch(`/api/audits/${audit.id}/approve`, { method: "POST" });
    setApproving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setActionError(j.error ?? "Approval failed.");
      return;
    }
    setApproveOpen(false);
    router.refresh();
  }

  // ── Ask Questions (email client the questions magic link) ──
  async function handleAskQuestions() {
    setAskingQuestions(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/audits/${audit.id}/ask-questions`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((json as { error?: string }).error ?? "Failed to send questions.");
        return;
      }
      setActionMessage("Questions email sent — waiting for the client's answers.");
      router.refresh();
    } catch {
      setActionError("Network error sending questions.");
    } finally {
      setAskingQuestions(false);
    }
  }

  // ── Run Final Audit (full context incl. answers) ──
  async function handleRunFinal() {
    setRunningFinal(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/audits/${audit.id}/run-final`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((json as { error?: string }).error ?? "Failed to start the final audit.");
        return;
      }
      setActionMessage("Final audit started.");
      router.refresh();
    } catch {
      setActionError("Network error starting the final audit.");
    } finally {
      setRunningFinal(false);
    }
  }

  // ── Generate PDF (separate workflow) ──
  async function handleGeneratePdf() {
    setGeneratingPdf(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/audits/${audit.id}/generate-pdf`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((json as { error?: string }).error ?? "Failed to start PDF generation.");
        return;
      }
      setActionMessage("PDF generation started — the PDF will appear here when it's ready.");
      router.refresh();
    } catch {
      setActionError("Network error starting PDF generation.");
    } finally {
      setGeneratingPdf(false);
    }
  }

  // ── Build Proposal — generate a proposal from the finished audit ──
  async function handleBuildProposal() {
    setBuildingProposal(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/audits/${audit.id}/build-proposal`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((json as { error?: string }).error ?? "Failed to start proposal generation.");
        return;
      }
      const proposalId = (json as { proposal_id?: string }).proposal_id;
      if (proposalId) {
        router.push(`/proposals/${proposalId}`);
      } else {
        router.refresh();
      }
    } catch {
      setActionError("Network error starting proposal generation.");
    } finally {
      setBuildingProposal(false);
    }
  }

  // ── Send Questionnaire ──
  async function handleSendQuestionnaire() {
    setSendingQuestionnaire(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/audits/${audit.id}/send-questionnaire`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((json as { error?: string }).error ?? "Failed to send questionnaire");
        return;
      }
      setActionMessage("Questionnaire link sent to client.");
      router.refresh();
    } catch {
      setActionError("Network error sending questionnaire.");
    } finally {
      setSendingQuestionnaire(false);
    }
  }

  // Follow-up questions the initial run generated, grouped by category.
  const questionGroups = Object.values(catData)
    .filter((c) => Array.isArray(c.missing_questions) && (c.missing_questions?.length ?? 0) > 0)
    .sort((a, b) => a.category_number - b.category_number)
    .map((c) => ({
      category_number: c.category_number,
      category_name: c.category_name,
      questions: c.missing_questions as string[],
    }));
  const totalQuestions = questionGroups.reduce((acc, g) => acc + g.questions.length, 0);

  return (
    <div className="space-y-10">
      {/* ── Section 1: Header strip ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[--border] pb-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-[--text-primary]">
              {(clientData.business_name as string) ?? "Audit"}
            </h1>
            <AuditStatusBadge status={audit.status} />

            {/* Inline tier dropdown */}
            <div className="relative">
              <button
                onClick={() => setTierOpen(!tierOpen)}
                className="flex items-center gap-1 rounded-md border border-[--border] bg-[--bg-secondary] px-2.5 py-1 text-xs font-medium text-[--text-primary] hover:border-[--accent] transition-colors"
                disabled={tierSaving}
              >
                {audit.final_tier ?? "No tier"}
                {audit.tier_overridden && <span title="Staff override" className="ml-1 text-amber-500">⚠</span>}
                <ChevronDown className="h-3 w-3 ml-0.5" />
              </button>
              {tierOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 w-36 rounded-md border border-[--border] bg-[--bg-primary] shadow-lg">
                  {TIERS.map((t) => (
                    <button
                      key={t}
                      onClick={() => handleTierChange(t)}
                      className={`w-full px-3 py-2 text-left text-xs hover:bg-[--bg-secondary] ${
                        audit.final_tier === t ? "font-semibold text-[--accent]" : "text-[--text-primary]"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {audit.flagged_for_review && (
              <Badge variant="warning">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Flagged
              </Badge>
            )}

            {siblingAudits.length > 1 && (
              <div className="flex items-center gap-1.5 text-xs">
                <label htmlFor="audit-version" className="text-[--text-tertiary]">Version</label>
                <select
                  id="audit-version"
                  value={audit.id}
                  onChange={(e) => router.push(`/audits/${e.target.value}`)}
                  className="rounded-md border border-[--border] bg-[--bg-secondary] px-2 py-1 text-xs text-[--text-primary] focus:outline-none focus:ring-1 focus:ring-[--accent]"
                >
                  {siblingAudits.map((v, idx) => (
                    <option key={v.id} value={v.id}>
                      v{siblingAudits.length - idx}
                      {v.is_current ? " (current)" : ""}
                      {" · "}
                      {new Date(v.created_at).toLocaleDateString("en-GB")}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-[--text-secondary]">
            {audit.total_opportunity_gbp != null && (
              <span className="font-semibold tabular-nums text-[--text-primary]">
                {fmt(audit.total_opportunity_gbp)} opportunity
              </span>
            )}
            {audit.audit_size_score != null && (
              <span>Size score: {audit.audit_size_score}</span>
            )}
            <Link href={`/clients/${audit.client_id}`} className="hover:text-[--accent]">
              View client →
            </Link>
          </div>
          {audit.flagged_for_review && audit.flag_reasons.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {audit.flag_reasons.map((r, i) => (
                <span key={i} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{r}</span>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {actionError && (
            <span className="text-xs text-[--danger]">{actionError}</span>
          )}
          {actionMessage && (
            <span className="text-xs text-emerald-600">{actionMessage}</span>
          )}

          {audit.status === "awaiting_questionnaire" && (
            <Button variant="secondary" size="sm" loading={sendingQuestionnaire} onClick={handleSendQuestionnaire}>
              <Send className="h-4 w-4" />
              Send questionnaire
            </Button>
          )}
          {audit.status === "audit_running" && (
            <span className="text-xs text-[--text-tertiary]">
              {audit.run_stage === "final" ? "Final audit is running…" : "Initial audit is running…"}
            </span>
          )}
          {audit.status === "awaiting_answers" && (
            <span className="text-xs text-[--text-tertiary]">Questions sent · waiting for the client’s answers…</span>
          )}

          {/* Ask Questions — once the initial audit (with questions) exists */}
          {(audit.status === "awaiting_review" || audit.status === "awaiting_answers") && totalQuestions > 0 && (
            <Button variant="primary" size="sm" loading={askingQuestions} onClick={handleAskQuestions}>
              <Send className="h-4 w-4" />
              {audit.status === "awaiting_answers" ? "Resend questions" : "Ask Questions"}
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-xs font-semibold">
                {totalQuestions}
              </span>
            </Button>
          )}

          {/* Run Final Audit — once the client's answers are received */}
          {audit.status === "answers_received" && (
            <Button variant="primary" size="sm" loading={runningFinal} onClick={handleRunFinal}>
              <RefreshCw className="h-4 w-4" />
              Run Final Audit
            </Button>
          )}

          {/* Generate PDF — once the final audit exists and no PDF yet */}
          {audit.status === "final_review" && !audit.pdf_path && !generatingPdf && (
            <Button variant="primary" size="sm" onClick={handleGeneratePdf}>
              <FileText className="h-4 w-4" />
              Generate PDF
            </Button>
          )}
          {audit.status === "final_review" && !audit.pdf_path && generatingPdf && (
            <span className="text-xs text-[--text-tertiary]">Generating PDF — this updates automatically when it’s ready…</span>
          )}

          {/* View PDF — always available once the PDF is ready (any status) */}
          {audit.pdf_path && pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                <ExternalLink className="h-4 w-4" />
                View PDF
              </Button>
            </a>
          )}

          {/* Build / View Proposal — once the final audit PDF is ready */}
          {audit.pdf_path && (audit.status === "final_review" || audit.status === "sent") && (
            proposal ? (
              <Link href={`/proposals/${proposal.id}`}>
                <Button variant="secondary" size="sm">
                  <ScrollText className="h-4 w-4" />
                  View Proposal
                </Button>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" loading={buildingProposal} onClick={handleBuildProposal}>
                <ScrollText className="h-4 w-4" />
                Build Proposal
              </Button>
            )
          )}

          {/* Approve & Send / Resend — available whenever the PDF is ready */}
          {audit.pdf_path && pdfUrl && (audit.status === "final_review" || audit.status === "sent") && (
            <Button variant="primary" size="sm" onClick={() => setApproveOpen(true)}>
              <Send className="h-4 w-4" />
              {audit.status === "sent" ? "Resend audit" : "Approve & Send"}
            </Button>
          )}
          {audit.status === "sent" && (
            <span className="text-xs text-emerald-600">Approved &amp; sent to client.</span>
          )}
        </div>
      </div>

      {/* ── Section 2: Lifecycle ── */}
      <div>
        <SectionTitle>Lifecycle</SectionTitle>
        <div className="flex items-start">
          {STATUS_STEPS.map((step, i) => {
            const val = audit[step.field] as string | null;
            const done = Boolean(val);
            return (
              <div key={step.key} className="flex flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  {i > 0 && <div className={`h-0.5 flex-1 ${done ? "bg-[--accent]" : "bg-[--border]"}`} />}
                  <div className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center ${done ? "border-[--accent] bg-[--accent]" : "border-[--border] bg-[--bg-primary]"}`}>
                    {done && <CheckCircle className="h-3.5 w-3.5 text-white" />}
                  </div>
                  {i < STATUS_STEPS.length - 1 && <div className={`h-0.5 flex-1 ${done ? "bg-[--accent]" : "bg-[--border]"}`} />}
                </div>
                <div className="mt-2 text-center">
                  <p className="text-xs font-medium text-[--text-primary]">{step.label}</p>
                  {val && <p className="text-xs text-[--text-tertiary]">{new Date(val).toLocaleDateString("en-GB")}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 3: Client info ── */}
      <div>
        <SectionTitle>Client information</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clientFields.map((field) => (
            <div key={field.id}>
              <label className="mb-1 block text-xs font-medium text-[--text-tertiary]">
                {field.label}{field.required && " *"}
              </label>
              <FieldInput
                field={field}
                value={clientData[field.field_key]}
                onChange={(v) => setClientData((prev) => ({ ...prev, [field.field_key]: v }))}
              />
            </div>
          ))}
        </div>
        <div className="mt-4">
          <SaveButton loading={clientSaving} onClick={saveClientData} label="Save client info" />
        </div>
      </div>

      {/* ── Section 4: Questionnaire ── */}
      <div>
        <SectionTitle>Questionnaire</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {questionnaireFields.map((field) => (
            <div key={field.id}>
              <label className="mb-1 block text-xs font-medium text-[--text-tertiary]">
                {field.label}{field.required && " *"}
              </label>
              <FieldInput
                field={field}
                value={qData[field.field_key]}
                onChange={(v) => setQData((prev) => ({ ...prev, [field.field_key]: v }))}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <SaveButton loading={qSaving} onClick={saveQuestionnaire} label="Save questionnaire" />
        </div>
      </div>

      {/* ── Follow-up questions (from the initial run) ── */}
      {questionGroups.length > 0 && (
        <div>
          <SectionTitle>
            Follow-up questions
            <span className="ml-2 rounded-full bg-[--bg-tertiary] px-2 py-0.5 text-xs font-medium text-[--text-secondary]">
              {totalQuestions}
            </span>
          </SectionTitle>
          <p className="mb-3 -mt-2 text-xs text-[--text-tertiary]">
            Generated by the initial audit. Use <strong>Ask Questions</strong> to email these to the client.
          </p>
          <div className="space-y-4">
            {(() => {
              let running = 0;
              return questionGroups.map((g) => (
                <div key={g.category_number} className="rounded-md border border-[--border] bg-[--bg-primary] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[--text-tertiary]">
                    {g.category_name}
                  </p>
                  <ol className="mt-2 space-y-1.5 text-sm text-[--text-primary]">
                    {g.questions.map((q, idx) => {
                      running += 1;
                      return (
                        <li key={idx} className="flex gap-2">
                          <span className="text-[--text-tertiary]">{running}.</span>
                          <span>{q}</span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* ── Client's answers (once received) ── */}
      {followupAnswers.length > 0 && (
        <div>
          <SectionTitle>
            Client’s answers
            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {followupAnswers.length}
            </span>
          </SectionTitle>
          <div className="space-y-3">
            {followupAnswers.map((a, idx) => (
              <div key={a.id} className="rounded-md border border-[--border] bg-[--bg-primary] p-4">
                <p className="text-sm font-medium text-[--text-primary]">
                  <span className="text-[--text-tertiary]">{idx + 1}.</span> {a.question_text}
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-[--text-secondary]">{a.answer_text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 5: Discovery call ── */}
      <div>
        <SectionTitle>Discovery call</SectionTitle>
        {!discoveryCall ? (
          <p className="rounded-md border border-[--border] bg-[--bg-secondary] px-4 py-3 text-sm text-[--text-secondary]">
            No discovery call data captured for this audit. Internal form may not have been submitted.
          </p>
        ) : (
          <>
            {discoveryCall.recording_consent_captured === false && (
              <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 dark:border-red-700/40 dark:bg-red-900/20">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                  ⚠️ No recording consent captured — audit engine will refuse to process the transcript.
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DCField label="Call date">
                {discoveryCall.call_date
                  ? new Date(discoveryCall.call_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                  : null}
              </DCField>
              <DCField label="Call number">{discoveryCall.call_number}</DCField>
              <DCField label="Recording consent">
                {discoveryCall.recording_consent_captured ? (
                  <span className="text-emerald-600">Yes</span>
                ) : (
                  <span className="text-red-600">No</span>
                )}
              </DCField>
              <DCField label="How they found Clearway">{discoveryCall.lead_source}</DCField>
              <DCField label="Years in business">{discoveryCall.years_in_business}</DCField>
              <DCField label="Turnover band">
                {discoveryCall.turnover_band
                  ? (TURNOVER_LABELS[discoveryCall.turnover_band] ?? discoveryCall.turnover_band)
                  : null}
              </DCField>
              <DCField label="Total staff">{discoveryCall.total_staff}</DCField>
              <DCField label="Sites">{discoveryCall.sites}</DCField>
              <DCField label="Rough enquiries/month">{discoveryCall.rough_enquiries_per_month}</DCField>
              <DCField label="Rough missed calls/month">{discoveryCall.rough_missed_calls_per_month}</DCField>
              <DCField label="Rough conversion %">
                {discoveryCall.rough_conversion_percent != null
                  ? `${discoveryCall.rough_conversion_percent}%`
                  : null}
              </DCField>
              <DCField label="Avg customer value">
                {discoveryCall.average_customer_value != null
                  ? `£${discoveryCall.average_customer_value}`
                  : null}
              </DCField>
              <DCField label="Rough admin hrs/week">{discoveryCall.rough_admin_hours_per_week}</DCField>
              {discoveryCall.anything_else_worth_knowing && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="text-xs font-medium text-[--text-tertiary]">Notes</p>
                  <pre className="mt-0.5 whitespace-pre-wrap font-sans text-sm text-[--text-primary]">
                    {discoveryCall.anything_else_worth_knowing}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Section 6: Executive summary ── */}
      <div>
        <SectionTitle>Executive summary</SectionTitle>
        <Textarea
          rows={5}
          value={execSummary}
          onChange={(e) => setExecSummary(e.target.value)}
          placeholder="One-page summary of the audit findings and recommendations…"
          className="max-w-3xl"
        />
        <div className="mt-3">
          <SaveButton loading={execSaving} onClick={saveExecSummary} label="Save summary" />
        </div>
      </div>

      {/* ── Section 7: Category cards ── */}
      <div>
        <SectionTitle>Category results</SectionTitle>
        <div className="space-y-4">
          {CATEGORIES.map((canonCat) => {
            const cat = catData[canonCat.number];
            const rag = cat ? SCORE_TO_RAG(cat.score) : null;
            const ragColors = rag ? RAG_COLORS[rag] : null;
            const saving = catSaving[canonCat.number] ?? false;

            return (
              <div
                key={canonCat.number}
                className={`rounded-md border ${ragColors?.border ?? "border-[--border]"} bg-[--bg-primary] p-5`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-[--text-tertiary]">
                      Category {canonCat.number}
                    </p>
                    <h3 className="text-sm font-semibold text-[--text-primary]">{canonCat.name}</h3>
                    <p className="text-xs text-[--text-tertiary]">{canonCat.description}</p>
                    {Array.isArray(cat?.missing_questions) &&
                      (cat?.missing_questions?.length ?? 0) > 0 && (
                        <span
                          className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800"
                          title="See the Follow-up questions section below"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          {cat!.missing_questions!.length} question
                          {cat!.missing_questions!.length === 1 ? "" : "s"}
                        </span>
                      )}
                  </div>
                  {rag && (
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ragColors?.bg} ${ragColors?.text}`}>
                      {rag}
                    </span>
                  )}
                </div>

                {!cat ? (
                  <p className="text-sm text-[--text-tertiary]">No data yet — waiting for audit to complete.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Score 1-5 */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[--text-tertiary]">Score (1=best, 5=worst)</label>
                      <Input
                        type="number" min={1} max={5}
                        value={cat.score ?? ""}
                        onChange={(e) => updateCat(canonCat.number, "score", e.target.value === "" ? null : Number(e.target.value))}
                      />
                    </div>

                    {/* Confidence */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[--text-tertiary]">Confidence (0–100%)</label>
                      <Input
                        type="number" min={0} max={100}
                        value={cat.confidence ?? ""}
                        onChange={(e) => updateCat(canonCat.number, "confidence", e.target.value === "" ? null : Number(e.target.value))}
                      />
                    </div>

                    {/* £ impact */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[--text-tertiary]">£ impact / year</label>
                      <Input
                        type="number" min={0}
                        value={cat.gbp_impact_annual ?? ""}
                        onChange={(e) => updateCat(canonCat.number, "gbp_impact_annual", e.target.value === "" ? null : Number(e.target.value))}
                      />
                    </div>

                    {/* Solution category */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[--text-tertiary]">Solution category</label>
                      <Input
                        value={cat.solution_category ?? ""}
                        onChange={(e) => updateCat(canonCat.number, "solution_category", e.target.value)}
                        placeholder="e.g. AI Voice Receptionist"
                      />
                    </div>

                    {/* £ calculation */}
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-[--text-tertiary]">£ calculation</label>
                      <Textarea
                        rows={2}
                        value={cat.gbp_calculation ?? ""}
                        onChange={(e) => updateCat(canonCat.number, "gbp_calculation", e.target.value)}
                        placeholder="e.g. 200 missed calls/mo × 30% conv × £25 = £1,500/mo"
                      />
                    </div>

                    {/* Evidence */}
                    <div className="sm:col-span-full">
                      <label className="mb-1 block text-xs font-medium text-[--text-tertiary]">Evidence</label>
                      <Textarea
                        rows={3}
                        value={cat.evidence ?? ""}
                        onChange={(e) => updateCat(canonCat.number, "evidence", e.target.value)}
                        placeholder="What in the transcript or questionnaire supports this score?"
                      />
                    </div>

                    {/* Report section */}
                    <div className="sm:col-span-full">
                      <label className="mb-1 block text-xs font-medium text-[--text-tertiary]">Report section (markdown)</label>
                      <Textarea
                        rows={6}
                        value={cat.report_section ?? ""}
                        onChange={(e) => updateCat(canonCat.number, "report_section", e.target.value)}
                        placeholder="## Category title&#10;&#10;Full analysis text that will appear in the PDF..."
                      />
                    </div>

                    {/* Flags */}
                    <div className="sm:col-span-full flex flex-wrap gap-4">
                      {(["insufficient_data", "used_defaults", "contradiction_flag"] as const).map((flag) => (
                        <label key={flag} className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(cat[flag])}
                            onChange={(e) => updateCat(canonCat.number, flag, e.target.checked)}
                            className="h-3.5 w-3.5 accent-[--accent]"
                          />
                          <span className="text-xs text-[--text-secondary]">
                            {flag === "insufficient_data" ? "Insufficient data"
                              : flag === "used_defaults" ? "Used defaults"
                              : "Contradiction flag"}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <SaveButton loading={saving} onClick={() => saveCategoryCard(canonCat.number)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 8: Review notes ── */}
      <div>
        <SectionTitle>Review notes</SectionTitle>
        <Textarea
          rows={4}
          value={reviewNotes}
          onChange={(e) => setReviewNotes(e.target.value)}
          placeholder="Internal notes for this review cycle…"
          className="max-w-2xl"
        />
        <div className="mt-3">
          <SaveButton loading={notesSaving} onClick={saveReviewNotes} label="Save notes" />
        </div>
      </div>

      {/* ── Section 9: Follow-ups ── */}
      <div>
        <SectionTitle>
          Follow-ups{clientFollowups.length > 1 ? ` (${clientFollowups.length})` : ""}
        </SectionTitle>
        {clientFollowups.length === 0 ? (
          <p className="text-sm text-[--text-tertiary]">No follow-ups received for this audit yet.</p>
        ) : (
          <div className="space-y-3">
            {clientFollowups.map((f) => {
              const dt = new Date(f.submitted_at);
              const dateStr = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
              const timeStr = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
              return (
                <div key={f.id} className="rounded-md border border-[--border] bg-[--bg-primary] p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[--text-tertiary]">{dateStr} · {timeStr}</span>
                    <span className="rounded-full border border-[--border] bg-[--bg-secondary] px-2 py-0.5 text-xs text-[--text-secondary]">
                      {f.source === "email_form" ? "Client form" : "Manual entry"}
                    </span>
                    {f.submitted_by_user_id && f.users?.email && (
                      <span className="text-xs text-[--text-tertiary]">by {f.users.email}</span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-[--text-primary]">{f.response_text}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 10: Files ── */}
      <div>
        <SectionTitle>Files</SectionTitle>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-[--text-tertiary]">Transcript</p>
            {transcriptUrl ? (
              <a href={transcriptUrl} download>
                <Button variant="secondary" size="sm">
                  <Download className="h-4 w-4" />
                  Download transcript
                </Button>
              </a>
            ) : (
              <p className="text-sm text-[--text-tertiary]">No transcript uploaded.</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-[--text-tertiary]">Audit PDF</p>
            {pdfUrl ? (
              <div className="flex gap-2">
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="primary" size="sm"><ExternalLink className="h-4 w-4" /> View PDF</Button>
                </a>
                <a href={pdfUrl} download>
                  <Button variant="secondary" size="sm"><Download className="h-4 w-4" /> Download</Button>
                </a>
              </div>
            ) : (
              <p className="text-sm text-[--text-tertiary]">
                {audit.status === "final_review"
                  ? "No PDF yet — use Generate PDF above."
                  : "PDF is generated after the final audit."}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 11: Webhook activity ── */}
      {webhookLogs.length > 0 && (
        <div>
          <SectionTitle>Recent webhook activity</SectionTitle>
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
                      <Badge variant={log.direction === "outgoing" ? "accent" : "neutral"}>{log.direction}</Badge>
                    </td>
                    <td className="px-3 py-2 max-w-[200px] truncate text-[--text-secondary]">{log.endpoint ?? "—"}</td>
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
          <Link href="/settings/health" className="mt-2 inline-block text-xs text-[--accent] hover:underline">
            Full webhook log →
          </Link>
        </div>
      )}

      {/* Approve / Resend modal */}
      <Dialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title={audit.status === "sent" ? "Resend audit" : "Approve & Send"}
        size="sm"
        description={
          audit.status === "sent"
            ? "The audit PDF will be emailed to the client again."
            : "The finished audit PDF will be emailed to the client and the audit marked as Sent. This cannot be undone."
        }
      >
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setApproveOpen(false)} disabled={approving}>Cancel</Button>
          <Button variant="primary" size="sm" loading={approving} onClick={handleApprove}>
            {audit.status === "sent" ? "Confirm resend" : "Confirm & Send"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
