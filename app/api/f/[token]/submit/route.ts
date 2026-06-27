import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// POST /api/f/[token]/submit
// Public — the access token is the credential. Saves the client's per-question
// answers and moves the audit to "answers_received".
interface AnswerInput {
  category_number: number | null;
  question_text: string;
  answer_text: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const body = (await request.json().catch(() => ({}))) as { answers?: AnswerInput[] };
  const answers = Array.isArray(body.answers) ? body.answers : [];

  if (answers.length === 0 || answers.some((a) => !a.answer_text?.trim() || !a.question_text?.trim())) {
    return NextResponse.json({ error: "All questions must be answered" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: audit } = await service
    .from("audits")
    .select("id, status, is_current, client_id, clients(business_name)")
    .eq("access_token", params.token)
    .maybeSingle();

  if (!audit) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (!audit.is_current) {
    return NextResponse.json({ error: "This audit is no longer active" }, { status: 409 });
  }
  if (audit.status !== "awaiting_answers") {
    return NextResponse.json({ error: "This audit is not awaiting answers" }, { status: 409 });
  }

  type ClientShape = { business_name: string };
  const rawClient = audit.clients as ClientShape[] | ClientShape | null;
  const businessName = (Array.isArray(rawClient) ? rawClient[0] : rawClient)?.business_name ?? "Client";

  // Replace any prior answers for idempotency, then insert this set.
  await service.from("followup_answers").delete().eq("audit_id", audit.id);
  const { error: insertErr } = await service.from("followup_answers").insert(
    answers.map((a) => ({
      audit_id: audit.id,
      category_number: a.category_number ?? null,
      question_text: a.question_text.trim(),
      answer_text: a.answer_text.trim(),
    }))
  );

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await service.from("audits").update({ status: "answers_received" }).eq("id", audit.id);

  // Notify staff that answers are in (Run Final Audit is now available).
  const { data: staffUsers } = await service.from("users").select("id").in("role", ["admin", "staff"]);
  if ((staffUsers ?? []).length > 0) {
    await service.from("notifications").insert(
      (staffUsers ?? []).map((u) => ({
        user_id: u.id,
        type: "answers_received",
        title: `Answers received — ${businessName}`,
        body: `${businessName} answered the follow-up questions. You can now run the final audit.`,
        link: `/audits/${audit.id}`,
      }))
    );
  }

  await service.from("audit_log").insert({
    actor_id: null,
    action: "audit.answers_received",
    entity_type: "audit",
    entity_id: audit.id,
    metadata: { answer_count: answers.length, source: "public_link" },
  });

  return NextResponse.json({ ok: true });
}
