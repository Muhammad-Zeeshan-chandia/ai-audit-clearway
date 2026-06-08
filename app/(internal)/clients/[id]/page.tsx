import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ChevronLeft } from "lucide-react";
import { ClientEditor } from "./client-editor";
import type { AuditStatus, FinalTier, FieldDefinition } from "@/lib/types";

function fmt(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const service  = createServiceClient();

  const { data: client, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", params.id)
    .is("deleted_at", null)
    .single();

  if (error || !client) notFound();

  const [
    { data: clientFields },
    { data: activity },
    { data: auditsRaw },
    { count: totalAuditCount },
  ] = await Promise.all([
    service
      .from("field_definitions")
      .select("*")
      .eq("entity", "client")
      .eq("active", true)
      .order("display_order"),

    service
      .from("audit_log")
      .select("id, action, created_at, metadata")
      .eq("entity_id", params.id)
      .order("created_at", { ascending: false })
      .limit(50),

    service
      .from("audits")
      .select("id, status, final_tier, total_opportunity_gbp, flagged_for_review, created_at, audit_run_at, sent_at")
      .eq("client_id", params.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(3),

    service
      .from("audits")
      .select("id", { count: "exact", head: true })
      .eq("client_id", params.id)
      .is("deleted_at", null),
  ]);

  const audits = (auditsRaw ?? []) as Array<{
    id: string;
    status: AuditStatus;
    final_tier: FinalTier | null;
    total_opportunity_gbp: number | null;
    flagged_for_review: boolean;
    created_at: string;
    audit_run_at: string | null;
    sent_at: string | null;
  }>;

  return (
    <div>
      <Link
        href="/clients"
        className="mb-4 inline-flex items-center gap-1 text-xs text-[--text-tertiary] hover:text-[--text-secondary]"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to clients
      </Link>

      <ClientEditor
        client={client as Record<string, unknown>}
        audits={audits}
        totalAuditCount={totalAuditCount ?? 0}
        activity={(activity ?? []) as Array<{ id: string; action: string; created_at: string; metadata: Record<string, unknown> | null }>}
        clientFields={(clientFields ?? []) as FieldDefinition[]}
        fmt={fmt}
      />
    </div>
  );
}
