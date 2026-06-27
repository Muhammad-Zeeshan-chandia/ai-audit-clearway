import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fireEmailFollowupWebhook, clientFollowupUrl } from "@/lib/n8n";
import { CATEGORIES } from "@/lib/constants/categories";

// POST /api/audits/[id]/email-followup
// Staff requests additional information from the client.
// Loads flagged categories, assembles question list, transitions audit to
// awaiting_client_followup, and fires n8n to deliver the email.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  const { data: audit } = await service
    .from("audits")
    .select("id, status, client_id, access_token, clients(id, email, business_name, owner_name)")
    .eq("id", params.id)
    .single();

  if (!audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  if (!["awaiting_review", "awaiting_client_followup", "followup_received"].includes(audit.status)) {
    return NextResponse.json({ error: "Audit is not in a reviewable state" }, { status: 409 });
  }

  type ClientShape = { id: string; email: string; business_name: string; owner_name: string | null };
  const rawClient = audit.clients as ClientShape[] | null;
  const client = Array.isArray(rawClient) ? rawClient[0] : (rawClient as unknown as ClientShape | null);

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Load categories with insufficient_data + missing_questions
  const { data: flaggedCats } = await service
    .from("audit_categories")
    .select("category_number, missing_questions")
    .eq("audit_id", params.id)
    .eq("insufficient_data", true)
    .order("category_number");

  const questionsByCategory = (flaggedCats ?? [])
    .filter(
      (c) =>
        Array.isArray(c.missing_questions) &&
        (c.missing_questions as string[]).length > 0
    )
    .map((c) => {
      const canonical = CATEGORIES.find((x) => x.number === c.category_number);
      return {
        category_number: c.category_number,
        category_name: canonical?.name ?? `Category ${c.category_number}`,
        questions: c.missing_questions as string[],
      };
    });

  await service
    .from("audits")
    .update({ status: "awaiting_client_followup" })
    .eq("id", params.id);

  fireEmailFollowupWebhook(
    {
      audit_id: params.id,
      client_email: client.email,
      client_name: client.owner_name,
      business_name: client.business_name,
      magic_link: clientFollowupUrl(audit.access_token as string),
      questions_by_category: questionsByCategory,
    },
    params.id
  ).catch((err) => console.error("[email-followup] webhook error:", err));

  await service.from("audit_log").insert({
    actor_id: user.id,
    action: "audit.followup_requested",
    entity_type: "audit",
    entity_id: params.id,
    metadata: {
      invite_sent: true,
      question_count: questionsByCategory.reduce((acc, g) => acc + g.questions.length, 0),
    },
  });

  return NextResponse.json({ ok: true });
}
