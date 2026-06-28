"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, RefreshCw, Send, CheckCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge, ProposalStatusBadge } from "@/components/ui/badge";
import type { ProposalStatus } from "@/lib/types";

function fmt(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

interface ProposalProp {
  id: string;
  audit_id: string;
  status: ProposalStatus;
  pdf_path: string | null;
  pdf_generated_at: string | null;
  instructions: string | null;
  regenerate_count: number;
  sent_at: string | null;
  created_at: string;
}

interface Props {
  proposal: ProposalProp;
  businessName: string;
  finalTier: string | null;
  totalOpportunityGbp: number | null;
  pdfUrl: string | null;
  webhookLogs: Array<{ id: string; direction: string; endpoint: string | null; response_status: number | null; created_at: string }>;
}

const STEPS: Array<{ key: string; label: string; field: keyof ProposalProp }> = [
  { key: "created",    label: "Requested", field: "created_at" },
  { key: "ready",      label: "Ready",     field: "pdf_generated_at" },
  { key: "sent",       label: "Sent",      field: "sent_at" },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 border-b border-[--border] pb-2 text-sm font-semibold text-[--text-primary]">
      {children}
    </h2>
  );
}

export function ProposalPanel({
  proposal,
  businessName,
  finalTier,
  totalOpportunityGbp,
  pdfUrl,
  webhookLogs,
}: Props) {
  const router = useRouter();

  const [notes, setNotes] = useState(proposal.instructions ?? "");
  const [regenerating, setRegenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const pdfReady = (proposal.status === "ready" || proposal.status === "sent") && Boolean(pdfUrl);
  const isGenerating = proposal.status === "generating";

  async function handleRegenerate() {
    setRegenerating(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/audits/${proposal.audit_id}/build-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: notes }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "Failed to regenerate the proposal.");
        return;
      }
      setMessage("Regenerating — the new proposal will appear here when it's ready.");
      router.refresh();
    } catch {
      setError("Network error regenerating the proposal.");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleSend() {
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/send`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "Failed to send the proposal.");
        return;
      }
      setMessage(proposal.status === "sent" ? "Proposal re-sent to the client." : "Proposal sent to the client.");
      router.refresh();
    } catch {
      setError("Network error sending the proposal.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[--border] pb-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-[--text-primary]">{businessName}</h1>
            <ProposalStatusBadge status={proposal.status} />
            {proposal.regenerate_count > 0 && (
              <Badge variant="neutral">Regenerated {proposal.regenerate_count}×</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-[--text-secondary]">
            {totalOpportunityGbp != null && (
              <span className="font-semibold tabular-nums text-[--text-primary]">
                {fmt(totalOpportunityGbp)} opportunity
              </span>
            )}
            {finalTier && <span>Tier: {finalTier}</span>}
            <Link href={`/audits/${proposal.audit_id}`} className="hover:text-[--accent]">
              View source audit →
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {error && <span className="text-xs text-[--danger]">{error}</span>}
          {message && <span className="text-xs text-emerald-600">{message}</span>}

          {isGenerating && (
            <span className="text-xs text-[--text-tertiary]">
              Generating proposal — this updates automatically when it&apos;s ready…
            </span>
          )}

          {pdfReady && pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                <ExternalLink className="h-4 w-4" />
                View in browser
              </Button>
            </a>
          )}

          {pdfReady && (
            <Button variant="primary" size="sm" loading={sending} onClick={handleSend}>
              <Send className="h-4 w-4" />
              {proposal.status === "sent" ? "Resend" : "Send proposal"}
            </Button>
          )}
        </div>
      </div>

      {/* Lifecycle */}
      <div>
        <SectionTitle>Lifecycle</SectionTitle>
        <div className="flex items-start">
          {STEPS.map((step, i) => {
            const val = proposal[step.field] as string | null;
            const done = Boolean(val);
            return (
              <div key={step.key} className="flex flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  {i > 0 && <div className={`h-0.5 flex-1 ${done ? "bg-[--accent]" : "bg-[--border]"}`} />}
                  <div className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center ${done ? "border-[--accent] bg-[--accent]" : "border-[--border] bg-[--bg-primary]"}`}>
                    {done && <CheckCircle className="h-3.5 w-3.5 text-white" />}
                  </div>
                  {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${done ? "bg-[--accent]" : "bg-[--border]"}`} />}
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

      {/* Proposal PDF */}
      <div>
        <SectionTitle>Proposal document</SectionTitle>
        {pdfReady && pdfUrl ? (
          <div className="flex gap-2">
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="primary" size="sm"><ExternalLink className="h-4 w-4" /> View in browser</Button>
            </a>
            <a href={pdfUrl} download>
              <Button variant="secondary" size="sm"><FileText className="h-4 w-4" /> Download</Button>
            </a>
          </div>
        ) : (
          <p className="rounded-md border border-[--border] bg-[--bg-secondary] px-4 py-3 text-sm text-[--text-secondary]">
            {isGenerating
              ? "The proposal is being generated. It will appear here automatically when ready."
              : "No proposal document yet."}
          </p>
        )}
      </div>

      {/* Regenerate */}
      <div>
        <SectionTitle>Regenerate with notes</SectionTitle>
        <p className="mb-3 -mt-2 text-xs text-[--text-tertiary]">
          Add instructions or notes to steer the next version. This rebuilds the proposal from the finished audit.
        </p>
        <Textarea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Emphasise the AI voice receptionist, soften the pricing language, add a 3-month rollout plan…"
          className="max-w-3xl"
          disabled={isGenerating}
        />
        <div className="mt-3">
          <Button variant="secondary" size="sm" loading={regenerating} disabled={isGenerating} onClick={handleRegenerate}>
            <RefreshCw className="h-4 w-4" />
            Regenerate proposal
          </Button>
        </div>
      </div>

      {/* Webhook activity */}
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
        </div>
      )}
    </div>
  );
}
