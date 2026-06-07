import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AuditStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardList, Eye, Clock } from "lucide-react";
import type { AuditStatus } from "@/lib/types";

export default async function PortalPage() {
  const supabase = createClient();
  const service = createServiceClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Find the client record matching this user's email
  // Use service client — RLS on clients allows clients to SELECT their own row,
  // but we need service client for the audits query below (RLS would hide non-sent audits)
  const { data: clientRecord } = await service
    .from("clients")
    .select("id, business_name, owner_name")
    .eq("email", user.email!)
    .is("deleted_at", null)
    .maybeSingle();

  // Use service client — RLS only lets clients see status='sent' audits,
  // but the portal must show all statuses so clients can complete their questionnaire.
  const { data: audits } = clientRecord
    ? await service
        .from("audits")
        .select("id, status, created_at, questionnaire_submitted_at")
        .eq("client_id", clientRecord.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: [] };

  const name = clientRecord?.owner_name ?? user.email;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[--text-primary]">
          Hello, {name?.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-[--text-secondary]">
          {clientRecord?.business_name ?? "Your Clearway AI audit"} — audit portal
        </p>
      </div>

      {(!audits || audits.length === 0) ? (
        <div className="rounded-md border border-[--border] bg-[--bg-primary] px-6 py-10 text-center">
          <Clock className="mx-auto mb-3 h-8 w-8 text-[--text-tertiary]" />
          <p className="text-sm font-medium text-[--text-primary]">No audits yet</p>
          <p className="mt-1 text-sm text-[--text-tertiary]">
            Your Clearway contact will send you a link when your audit is ready.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {audits.map((audit) => (
            <AuditCard key={audit.id} audit={audit} />
          ))}
        </div>
      )}

      {/* GDPR — right to erasure */}
      <div className="border-t border-[--border] pt-4 mt-8">
        <p className="text-xs text-[--text-tertiary]">
          Under GDPR, you may request the deletion of all data Clearway AI holds about you.{" "}
          <Link href="/portal/delete-request" className="text-[--danger] hover:underline">
            Request data deletion →
          </Link>
        </p>
      </div>
    </div>
  );
}

function AuditCard({
  audit,
}: {
  audit: {
    id: string;
    status: string;
    created_at: string;
    questionnaire_submitted_at: string | null;
  };
}) {
  const status = audit.status as AuditStatus;

  return (
    <div className="rounded-md border border-[--border] bg-[--bg-primary] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <AuditStatusBadge status={status} />
            <span className="text-xs text-[--text-tertiary]">
              Started {new Date(audit.created_at).toLocaleDateString("en-GB")}
            </span>
          </div>

          <p className="mt-3 text-sm text-[--text-secondary]">
            {status === "awaiting_questionnaire" &&
              "Please complete the short questionnaire so we can prepare your audit."}
            {status === "audit_running" &&
              "We're working on your audit. You'll receive an email when it's ready."}
            {(status === "awaiting_review" || status === "approved") &&
              "Your audit is complete and being reviewed by our team."}
            {status === "sent" &&
              "Your audit report is ready to view."}
            {status === "failed" &&
              "There was an issue with your audit. Please contact your Clearway representative."}
          </p>
        </div>

        <div className="shrink-0">
          {status === "awaiting_questionnaire" && (
            <Link href={`/portal/questionnaire/${audit.id}`}>
              <Button variant="primary" size="md">
                <ClipboardList className="h-4 w-4" />
                Complete questionnaire
              </Button>
            </Link>
          )}
          {status === "sent" && (
            <Link href={`/portal/audit/${audit.id}`}>
              <Button variant="primary" size="md">
                <Eye className="h-4 w-4" />
                View audit
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
