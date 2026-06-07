"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { DynamicForm } from "@/components/forms/dynamic-form";
import { FileUploader } from "@/components/forms/file-uploader";
import { Checkbox } from "@/components/ui/checkbox";
import type { FieldDefinition } from "@/lib/types";

interface Props {
  fields: FieldDefinition[];
}

export function NewClientForm({ fields }: Props) {
  const router = useRouter();

  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(data: Record<string, unknown>) {
    // Validate extras
    let hasError = false;

    if (!consentChecked) {
      setConsentError("You must confirm consent before submitting.");
      hasError = true;
    } else {
      setConsentError(null);
    }

    if (!transcriptFile) {
      setFileError("Transcript file is required.");
      hasError = true;
    } else {
      setFileError(null);
    }

    if (hasError) return;

    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("fields", JSON.stringify({ ...data, consent_captured: true }));
      if (transcriptFile) {
        formData.append("transcript", transcriptFile);
      }

      const res = await fetch("/api/clients", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        return;
      }

      router.push(`/audits/${json.auditId}`);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const extraContent = (
    <div className="space-y-5 pt-2">
      <div className="border-t border-[--border] pt-4">
        <FileUploader
          label="Transcript file"
          required={true}
          onChange={setTranscriptFile}
          uploading={submitting}
          error={fileError ?? undefined}
        />
      </div>

      <div className="border-t border-[--border] pt-4">
        <Checkbox
          id="consent"
          label={
            <span>
              I confirm that{" "}
              <strong>explicit consent has been captured</strong> from this client to process their
              business data for the purpose of the Clearway AI Audit.
            </span>
          }
          checked={consentChecked}
          onChange={(e) => {
            setConsentChecked(e.target.checked);
            if (e.target.checked) setConsentError(null);
          }}
          error={consentError ?? undefined}
        />
      </div>

      {error && (
        <div className="rounded-md border border-[--danger] bg-red-50 px-4 py-3 text-sm text-[--danger]">
          {error}
        </div>
      )}
    </div>
  );

  return (
    <DynamicForm
      fields={fields}
      onSubmit={handleSubmit}
      submitLabel="Create client & send questionnaire"
      extraContent={extraContent}
      disabled={submitting}
    />
  );
}
