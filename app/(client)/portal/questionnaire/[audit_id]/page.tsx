import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QuestionnaireForm } from "./questionnaire-form";
import type { FieldDefinition } from "@/lib/types";

export default async function QuestionnairePage({
  params,
}: {
  params: { audit_id: string };
}) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Load the audit + its client (to verify ownership)
  const { data: audit, error } = await supabase
    .from("audits")
    .select("id, status, client_id, is_current, clients(id, email, business_name, owner_name, sector, website_url)")
    .eq("id", params.audit_id)
    .single();

  if (error || !audit) notFound();

  // Verify the authenticated user's email matches the client
  type ClientShape = { id: string; email: string; business_name: string; owner_name: string | null; sector: string | null; website_url: string | null };
  const rawClients = audit.clients as ClientShape[] | null;
  const clientData = (Array.isArray(rawClients) ? rawClients[0] : rawClients as unknown as ClientShape | null);

  if (!clientData || clientData.email.toLowerCase() !== user.email!.toLowerCase()) {
    redirect("/portal");
  }

  // Guard against archived audits
  if (!audit.is_current) {
    redirect("/portal");
  }

  // Only show if questionnaire is pending
  if (audit.status !== "awaiting_questionnaire") {
    redirect("/portal");
  }

  // Load questionnaire field definitions
  const { data: fields } = await supabase
    .from("field_definitions")
    .select("*")
    .eq("entity", "questionnaire")
    .eq("active", true)
    .order("display_order", { ascending: true });

  // Load any existing partial questionnaire data (so client can resume)
  const { data: existingQuestionnaire } = await supabase
    .from("questionnaires")
    .select("id, data")
    .eq("audit_id", params.audit_id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[--accent]">
          {clientData.business_name}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-[--text-primary]">
          Tell us about your business
        </h1>
        <p className="mt-1 text-sm text-[--text-secondary]">
          This takes about 5 minutes. Your progress is saved automatically.
        </p>
      </div>

      <QuestionnaireForm
        auditId={params.audit_id}
        fields={(fields ?? []) as FieldDefinition[]}
        initialValues={(existingQuestionnaire?.data ?? {}) as Record<string, unknown>}
        existingQuestionnaireId={existingQuestionnaire?.id ?? null}
        clientMeta={{
          business_name: clientData.business_name,
          sector: clientData.sector,
          owner_name: clientData.owner_name,
        }}
      />
    </div>
  );
}
