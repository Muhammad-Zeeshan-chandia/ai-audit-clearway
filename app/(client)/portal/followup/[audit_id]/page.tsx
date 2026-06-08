import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CATEGORIES } from "@/lib/constants/categories";
import FollowupForm from "./followup-form";

interface PageProps {
  params: { audit_id: string };
}

export default async function FollowupPage({ params }: PageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/portal/followup/${params.audit_id}`);

  const service = createServiceClient();

  const { data: audit } = await service
    .from("audits")
    .select("id, status, is_current, client_id, clients(email, business_name, owner_name)")
    .eq("id", params.audit_id)
    .single();

  if (!audit) notFound();

  type ClientShape = { email: string; business_name: string; owner_name: string | null };
  const rawClient = audit.clients as ClientShape[] | null;
  const client = Array.isArray(rawClient) ? rawClient[0] : (rawClient as unknown as ClientShape | null);

  if (!client || client.email.toLowerCase() !== user.email!.toLowerCase()) {
    redirect("/portal");
  }

  if (!audit.is_current) {
    redirect("/portal");
  }

  const { data: cats } = await service
    .from("audit_categories")
    .select("category_number, insufficient_data, missing_questions")
    .eq("audit_id", params.audit_id)
    .order("category_number");

  const questionGroups = (cats ?? [])
    .filter(
      (c) =>
        c.insufficient_data &&
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

  const { data: existingFollowups } = await service
    .from("client_followups")
    .select("id, response_text, submitted_at")
    .eq("audit_id", params.audit_id)
    .order("submitted_at", { ascending: true });

  return (
    <FollowupForm
      auditId={params.audit_id}
      status={audit.status}
      businessName={client.business_name}
      ownerName={client.owner_name}
      questionGroups={questionGroups}
      previousResponses={existingFollowups ?? []}
    />
  );
}
