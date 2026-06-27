import { createServiceClient } from "@/lib/supabase/server";
import { CATEGORIES } from "@/lib/constants/categories";
import FollowupForm from "./followup-form";

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

export default async function PublicFollowupPage({
  params,
}: {
  params: { token: string };
}) {
  const service = createServiceClient();

  const { data: audit } = await service
    .from("audits")
    .select("id, status, is_current, clients(business_name, owner_name)")
    .eq("access_token", params.token)
    .maybeSingle();

  if (!audit) {
    return (
      <Notice
        title="This link isn’t valid"
        body="The link may be incorrect or expired. Please use the most recent email we sent you."
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

  type ClientShape = { business_name: string; owner_name: string | null };
  const rawClient = audit.clients as ClientShape[] | ClientShape | null;
  const client = Array.isArray(rawClient) ? rawClient[0] : rawClient;

  const { data: cats } = await service
    .from("audit_categories")
    .select("category_number, insufficient_data, missing_questions")
    .eq("audit_id", audit.id)
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
    .eq("audit_id", audit.id)
    .order("submitted_at", { ascending: true });

  return (
    <Shell>
      <FollowupForm
        token={params.token}
        status={audit.status}
        businessName={client?.business_name ?? "your business"}
        ownerName={client?.owner_name ?? null}
        questionGroups={questionGroups}
        previousResponses={existingFollowups ?? []}
      />
    </Shell>
  );
}
