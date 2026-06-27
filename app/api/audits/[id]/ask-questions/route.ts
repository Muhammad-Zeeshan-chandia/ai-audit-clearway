import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fireAskQuestionsWebhook, clientFollowupUrl } from "@/lib/n8n";
import { CATEGORIES } from "@/lib/constants/categories";

// POST /api/audits/[id]/ask-questions
// Emails the client a magic link to the questions page (one box per question)
// and moves the audit to "awaiting_answers".
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  const { data: audit } = await service
    .from("audits")
    .select("id, status, access_token, clients(email, business_name, owner_name)")
    .eq("id", params.id)
    .single();

  if (!audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  // Available once the initial audit (with questions) exists; re-send allowed.
  if (!["awaiting_review", "awaiting_answers"].includes(audit.status)) {
    return NextResponse.json({ error: "Audit is not ready to send questions" }, { status: 409 });
  }

  type ClientShape = { email: string; business_name: string; owner_name: string | null };
  const rawClient = audit.clients as ClientShape[] | ClientShape | null;
  const client = Array.isArray(rawClient) ? rawClient[0] : rawClient;
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Gather every question the initial run generated, grouped by category.
  const { data: cats } = await service
    .from("audit_categories")
    .select("category_number, missing_questions")
    .eq("audit_id", params.id)
    .order("category_number");

  const questionsByCategory = (cats ?? [])
    .filter((c) => Array.isArray(c.missing_questions) && (c.missing_questions as string[]).length > 0)
    .map((c) => {
      const canon = CATEGORIES.find((x) => x.number === c.category_number);
      return {
        category_number: c.category_number,
        category_name: canon?.name ?? `Category ${c.category_number}`,
        questions: c.missing_questions as string[],
      };
    });

  if (questionsByCategory.length === 0) {
    return NextResponse.json(
      { error: "No follow-up questions were generated for this audit." },
      { status: 422 }
    );
  }

  await service.from("audits").update({ status: "awaiting_answers" }).eq("id", params.id);

  fireAskQuestionsWebhook(
    {
      audit_id: params.id,
      client_email: client.email,
      client_name: client.owner_name ?? null,
      business_name: client.business_name,
      magic_link: clientFollowupUrl(audit.access_token as string),
      questions_by_category: questionsByCategory,
    },
    params.id
  ).catch((err) => console.error("[ask-questions] webhook error:", err));

  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.questions_sent",
    entity_type: "audit",
    entity_id: params.id,
    metadata: {
      question_count: questionsByCategory.reduce((acc, g) => acc + g.questions.length, 0),
    },
  });

  return NextResponse.json({ ok: true });
}
