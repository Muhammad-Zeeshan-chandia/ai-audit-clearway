"use client";

import { useState } from "react";

interface QuestionGroup {
  category_number: number;
  category_name: string;
  questions: string[];
}

interface PreviousResponse {
  id: string;
  response_text: string;
  submitted_at: string;
}

interface Props {
  token: string;
  status: string;
  businessName: string;
  ownerName: string | null;
  questionGroups: QuestionGroup[];
  previousResponses: PreviousResponse[];
}

export default function FollowupForm({
  token,
  status,
  businessName,
  ownerName,
  questionGroups,
  previousResponses,
}: Props) {
  const [responseText, setResponseText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAlreadyHandled =
    status !== "awaiting_client_followup" || previousResponses.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (responseText.trim().length < 10) {
      setError("Please write at least a couple of sentences.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/f/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response_text: responseText.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  if (submitted || isAlreadyHandled) {
    return (
      <div className="rounded-md border border-[--border] bg-[--bg-primary] p-8 text-center">
        <h1 className="text-xl font-semibold text-[--text-primary]">
          Thanks — we’ve got what we need
        </h1>
        <p className="mt-3 text-sm text-[--text-secondary]">
          Your follow-up is in. The team will fold it into your audit and send you
          the updated report by email.
        </p>
      </div>
    );
  }

  if (questionGroups.length === 0) {
    return (
      <div className="rounded-md border border-[--border] bg-[--bg-primary] p-8 text-center">
        <h1 className="text-xl font-semibold text-[--text-primary]">
          Nothing to answer right now
        </h1>
        <p className="mt-3 text-sm text-[--text-secondary]">
          We don’t have any open questions for you at the moment. If you think this
          is wrong, please reply to the email we sent you.
        </p>
      </div>
    );
  }

  const totalQuestions = questionGroups.reduce((acc, g) => acc + g.questions.length, 0);
  const firstName = ownerName?.split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[--accent]">
          {businessName}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-[--text-primary]">
          {firstName ? `Hi ${firstName} — w` : "W"}e need a bit more info
        </h1>
        <p className="mt-1 text-sm text-[--text-secondary]">
          Our team is finalising your audit and noticed a few gaps. Read the{" "}
          {totalQuestions === 1 ? "question" : `${totalQuestions} questions`} below and
          answer in your own words — a paragraph is fine. Takes ~2 minutes.
        </p>
      </div>

      <div className="space-y-4">
        {questionGroups.map((group) => (
          <div
            key={group.category_number}
            className="rounded-md border border-[--border] bg-[--bg-primary] p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[--text-tertiary]">
              {group.category_name}
            </p>
            <ol className="mt-3 space-y-2 text-sm text-[--text-primary]">
              {group.questions.map((q, idx) => (
                <li key={idx} className="flex gap-3">
                  <span className="font-medium text-[--text-tertiary]">{idx + 1}.</span>
                  <span>{q}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="response" className="block text-sm font-medium text-[--text-primary]">
            Your response
          </label>
          <p className="mt-1 text-xs text-[--text-tertiary]">
            Address the questions above in any order — a single paragraph or labelled
            answers, whatever’s easiest.
          </p>
          <textarea
            id="response"
            name="response"
            required
            minLength={10}
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            rows={12}
            placeholder="Type your answers here…"
            className="mt-3 w-full resize-y rounded-md border border-[--border] bg-[--bg-secondary] p-3 text-sm text-[--text-primary] placeholder:text-[--text-tertiary] focus:border-[--accent] focus:outline-none focus:ring-2 focus:ring-[--accent]/20"
          />
        </div>

        {error && (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-[--text-tertiary]">
            By submitting you confirm the info above is accurate to the best of your knowledge.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex shrink-0 items-center justify-center rounded-md bg-[--accent] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit follow-up"}
          </button>
        </div>
      </form>
    </div>
  );
}
