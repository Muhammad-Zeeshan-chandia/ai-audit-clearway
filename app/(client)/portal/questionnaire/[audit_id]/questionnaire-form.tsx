"use client";

import React, { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";
import { DynamicForm } from "@/components/forms/dynamic-form";
import { CheckCircle } from "lucide-react";
import type { FieldDefinition } from "@/lib/types";

interface Props {
  auditId: string;
  fields: FieldDefinition[];
  initialValues: Record<string, unknown>;
  existingQuestionnaireId: string | null;
  clientMeta: {
    business_name: string;
    sector: string | null;
    owner_name: string | null;
  };
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function QuestionnaireForm({
  auditId,
  fields,
  initialValues,
  existingQuestionnaireId,
  clientMeta,
}: Props) {
  const supabase = createClient();
  const questionnaireIdRef = useRef<string | null>(existingQuestionnaireId);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleAutoSave(data: Record<string, unknown>) {
    setSaveState("saving");
    try {
      if (questionnaireIdRef.current) {
        // Update existing row
        await supabase
          .from("questionnaires")
          .update({ data })
          .eq("id", questionnaireIdRef.current);
      } else {
        // Create new row
        const { data: newRow } = await supabase
          .from("questionnaires")
          .insert({ audit_id: auditId, data })
          .select("id")
          .single();
        if (newRow) questionnaireIdRef.current = newRow.id;
      }
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function handleSubmit(data: Record<string, unknown>) {
    setSubmitError(null);

    // Final save of questionnaire data
    if (questionnaireIdRef.current) {
      await supabase
        .from("questionnaires")
        .update({ data })
        .eq("id", questionnaireIdRef.current);
    } else {
      const { data: newRow } = await supabase
        .from("questionnaires")
        .insert({ audit_id: auditId, data })
        .select("id")
        .single();
      if (newRow) questionnaireIdRef.current = newRow.id;
    }

    // Call submit API route (server-side: updates audit status + fires n8n webhook)
    const res = await fetch(`/api/questionnaires/${auditId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionnaire_data: data, client_meta: clientMeta }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setSubmitError(json.error ?? "Submission failed. Please try again.");
      throw new Error("Submit failed"); // keeps DynamicForm in loading state until thrown
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="rounded-md border border-[--border] bg-[--bg-primary] px-6 py-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[--accent-light]">
          <CheckCircle className="h-6 w-6 text-[--accent]" />
        </div>
        <h2 className="text-lg font-semibold text-[--text-primary]">
          Thank you — your audit is being prepared
        </h2>
        <p className="mt-2 text-sm text-[--text-secondary]">
          Our AI engine is now analysing your business. You&apos;ll receive an email
          when your audit report is ready to view, usually within a few hours.
        </p>
        <p className="mt-4 text-xs text-[--text-tertiary]">
          You can close this window.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[--border] bg-[--bg-primary] p-6">
      {/* Auto-save indicator */}
      <div className="mb-4 flex items-center justify-end gap-1.5 text-xs text-[--text-tertiary]">
        {saveState === "saving" && <span>Saving…</span>}
        {saveState === "saved"  && <span className="text-[--success]">Progress saved</span>}
        {saveState === "error"  && <span className="text-[--warning]">Save failed — will retry</span>}
      </div>

      <DynamicForm
        fields={fields}
        initialValues={initialValues}
        onSubmit={handleSubmit}
        onAutoSave={handleAutoSave}
        submitLabel="Submit questionnaire"
        extraContent={
          submitError ? (
            <div className="rounded-md border border-[--danger] bg-red-50 px-4 py-3 text-sm text-[--danger]">
              {submitError}
            </div>
          ) : null
        }
      />
    </div>
  );
}
