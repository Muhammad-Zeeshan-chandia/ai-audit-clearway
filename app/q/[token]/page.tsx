import { createServiceClient } from "@/lib/supabase/server";
import { QuestionnaireForm } from "./questionnaire-form";
import type { FieldDefinition } from "@/lib/types";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[--bg-secondary] px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 text-center">
          <span className="text-lg font-semibold text-[--accent]">Clearway AI</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="rounded-md border border-[--border] bg-[--bg-primary] px-6 py-10 text-center">
        <h1 className="text-lg font-semibold text-[--text-primary]">{title}</h1>
        <p className="mt-2 text-sm text-[--text-secondary]">{body}</p>
      </div>
    </Shell>
  );
}

export default async function PublicQuestionnairePage({
  params,
}: {
  params: { token: string };
}) {
  const service = createServiceClient();

  const { data: audit } = await service
    .from("audits")
    .select(
      "id, status, is_current, access_token, clients(business_name, sector, owner_name)"
    )
    .eq("access_token", params.token)
    .maybeSingle();

  if (!audit) {
    return (
      <Notice
        title="This link isn’t valid"
        body="The link may be incorrect or expired. Please use the most recent email we sent you, or contact your Clearway representative."
      />
    );
  }

  if (!audit.is_current) {
    return (
      <Notice
        title="This audit is no longer active"
        body="A newer version of this audit has replaced it. Please use the latest link we emailed you."
      />
    );
  }

  if (audit.status !== "awaiting_questionnaire") {
    return (
      <Notice
        title="Thanks — we’ve already got your answers"
        body="Your questionnaire has been received and your audit is being prepared. You’ll get the report by email when it’s ready."
      />
    );
  }

  type ClientShape = { business_name: string; sector: string | null; owner_name: string | null };
  const rawClients = audit.clients as ClientShape[] | ClientShape | null;
  const client = Array.isArray(rawClients) ? rawClients[0] : rawClients;

  const { data: fields } = await service
    .from("field_definitions")
    .select("*")
    .eq("entity", "questionnaire")
    .eq("active", true)
    .order("display_order", { ascending: true });

  const { data: existingQuestionnaire } = await service
    .from("questionnaires")
    .select("data")
    .eq("audit_id", audit.id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <Shell>
      <div className="mb-6">
        {client?.business_name && (
          <p className="text-xs font-semibold uppercase tracking-wide text-[--accent]">
            {client.business_name}
          </p>
        )}
        <h1 className="mt-1 text-xl font-semibold text-[--text-primary]">
          Tell us about your business
        </h1>
        <p className="mt-1 text-sm text-[--text-secondary]">
          This takes about 5 minutes. There’s no login — just answer and submit.
        </p>
      </div>

      <QuestionnaireForm
        token={params.token}
        fields={(fields ?? []) as FieldDefinition[]}
        initialValues={(existingQuestionnaire?.data ?? {}) as Record<string, unknown>}
      />
    </Shell>
  );
}
