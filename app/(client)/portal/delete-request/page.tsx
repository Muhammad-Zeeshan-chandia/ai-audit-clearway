"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import Link from "next/link";

export default function DeleteRequestPage() {
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handleRequest() {
    if (!confirmed) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/gdpr/delete-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const json = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(json.error ?? "Request failed. Please contact your Clearway representative.");
      return;
    }

    setDone(json.message);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-[--text-primary]">Request submitted</h1>
        <p className="text-sm text-[--text-secondary]">{done}</p>
        <p className="text-sm text-[--text-secondary]">
          A confirmation email has been sent to you. If you wish to cancel, contact your Clearway representative before the deadline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal" className="mb-2 inline-flex items-center gap-1 text-xs text-[--text-tertiary] hover:text-[--text-secondary]">
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to portal
        </Link>
        <h1 className="text-xl font-semibold text-[--text-primary]">Request data deletion</h1>
        <p className="mt-1 text-sm text-[--text-secondary]">
          Under GDPR Article 17, you have the right to request the deletion of all data Clearway AI holds about you.
        </p>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-amber-800">This action is permanent</p>
            <p className="text-sm text-amber-700">
              Submitting this request will permanently delete your business data, audit results, and account after a 7-day grace period.
              This cannot be undone.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-[--border] bg-[--bg-primary] p-5 space-y-4">
        <p className="text-sm font-medium text-[--text-primary]">What will be deleted:</p>
        <ul className="list-disc list-inside space-y-1 text-sm text-[--text-secondary]">
          <li>Your business information (name, contact details, notes)</li>
          <li>All audit transcripts and questionnaire responses</li>
          <li>Your audit reports and PDF documents</li>
          <li>Your Clearway AI account and login access</li>
        </ul>

        <label className="flex items-start gap-2.5 cursor-pointer mt-4">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[--danger]"
          />
          <span className="text-sm text-[--text-primary]">
            I understand this is permanent and irreversible. I confirm I want to request deletion of all my data.
          </span>
        </label>

        {error && <p className="text-sm text-[--danger]">{error}</p>}

        <Button
          variant="danger"
          size="md"
          onClick={handleRequest}
          disabled={!confirmed}
          loading={submitting}
        >
          Submit deletion request
        </Button>
      </div>
    </div>
  );
}
