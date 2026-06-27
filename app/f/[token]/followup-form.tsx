"use client";

import { useState } from "react";

interface QuestionGroup {
  category_number: number;
  category_name: string;
  questions: string[];
}

interface Props {
  token: string;
  businessName: string;
  ownerName: string | null;
  questionGroups: QuestionGroup[];
}

type Item = {
  key: string;
  category_number: number;
  category_name: string;
  question_text: string;
  number: number;
};

export default function FollowupForm({ token, businessName, ownerName, questionGroups }: Props) {
  // Flatten into individually-answerable items, keeping a running number.
  const items: Item[] = [];
  let n = 0;
  for (const g of questionGroups) {
    for (let i = 0; i < g.questions.length; i++) {
      n += 1;
      items.push({
        key: `${g.category_number}::${i}`,
        category_number: g.category_number,
        category_name: g.category_name,
        question_text: g.questions[i],
        number: n,
      });
    }
  }

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setAnswer(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const unanswered = items.filter((it) => (answers[it.key] ?? "").trim().length < 2);
    if (unanswered.length > 0) {
      setError(`Please answer all ${items.length} questions before submitting.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/f/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: items.map((it) => ({
            category_number: it.category_number,
            question_text: it.question_text,
            answer_text: (answers[it.key] ?? "").trim(),
          })),
        }),
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

  if (submitted) {
    return (
      <div className="rounded-md border border-[--border] bg-[--bg-primary] p-8 text-center">
        <h1 className="text-xl font-semibold text-[--text-primary]">
          Thanks — we’ve got your answers
        </h1>
        <p className="mt-3 text-sm text-[--text-secondary]">
          Your answers are in. Our team is folding them into your audit and will send you
          the final report by email.
        </p>
        <p className="mt-4 text-xs text-[--text-tertiary]">You can close this window.</p>
      </div>
    );
  }

  const firstName = ownerName?.split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[--accent]">
          {businessName}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-[--text-primary]">
          {firstName ? `Hi ${firstName} — a` : "A"} few questions to sharpen your audit
        </h1>
        <p className="mt-1 text-sm text-[--text-secondary]">
          Our analysis flagged {items.length === 1 ? "one question" : `${items.length} questions`} we’d
          like your input on. Answer each in your own words — a sentence or two is plenty.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {questionGroups.map((group) => (
          <div
            key={group.category_number}
            className="rounded-md border border-[--border] bg-[--bg-primary] p-5"
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[--text-tertiary]">
              {group.category_name}
            </p>
            <div className="space-y-5">
              {group.questions.map((q, i) => {
                const item = items.find(
                  (it) => it.category_number === group.category_number && it.key === `${group.category_number}::${i}`
                )!;
                return (
                  <div key={item.key}>
                    <label
                      htmlFor={item.key}
                      className="block text-sm font-medium text-[--text-primary]"
                    >
                      <span className="mr-1.5 text-[--text-tertiary]">{item.number}.</span>
                      {q}
                    </label>
                    <textarea
                      id={item.key}
                      rows={3}
                      value={answers[item.key] ?? ""}
                      onChange={(e) => setAnswer(item.key, e.target.value)}
                      placeholder="Your answer…"
                      className="mt-2 w-full resize-y rounded-md border border-[--border] bg-[--bg-secondary] p-3 text-sm text-[--text-primary] placeholder:text-[--text-tertiary] focus:border-[--accent] focus:outline-none focus:ring-2 focus:ring-[--accent]/20"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

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
            {submitting ? "Submitting…" : "Submit answers"}
          </button>
        </div>
      </form>
    </div>
  );
}
