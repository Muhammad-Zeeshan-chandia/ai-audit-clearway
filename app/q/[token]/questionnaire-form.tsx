"use client";

import { useState } from "react";
import { DynamicForm } from "@/components/forms/dynamic-form";
import { CheckCircle } from "lucide-react";
import type { FieldDefinition } from "@/lib/types";

interface Props {
  token: string;
  fields: FieldDefinition[];
  initialValues: Record<string, unknown>;
}

export function QuestionnaireForm({ token, fields, initialValues }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(data: Record<string, unknown>) {
    setSubmitError(null);

    const res = await fetch(`/api/q/${token}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionnaire_data: data }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setSubmitError(json.error ?? "Submission failed. Please try again.");
      throw new Error("Submit failed"); // keeps DynamicForm in loading state
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
          Perfect — that’s everything we need to get started.
        </h2>
        <p className="mt-3 text-sm text-[--text-secondary]">
          From here, the work is on us. Our team takes your answers and your data and
          digs deep to find exactly where money and time are leaking — and what it’s
          costing you each month. You’ll have your full report within 5–7 business days.
        </p>
        <p className="mt-4 text-xs text-[--text-tertiary]">You can close this window.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[--border] bg-[--bg-primary] p-6">
      <DynamicForm
        fields={fields}
        initialValues={initialValues}
        onSubmit={handleSubmit}
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
