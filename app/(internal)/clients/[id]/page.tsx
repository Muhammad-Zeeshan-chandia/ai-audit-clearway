import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClientDetailTabs } from "./client-detail-tabs";
import { ChevronLeft, Plus } from "lucide-react";
import type { AuditStatus, FinalTier } from "@/lib/types";

const SECTOR_LABELS: Record<string, string> = {
  restaurant: "Restaurant",
  clinic_dental: "Dental / Clinic",
  trades: "Trades",
  agency_consultancy: "Agency / Consultancy",
  retail_ecommerce: "Retail / eCommerce",
  gym_fitness: "Gym / Fitness",
  salon_beauty: "Salon / Beauty",
  hotel_hospitality: "Hotel / Hospitality",
  other: "Other",
};

function fmt(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: client, error } = await supabase
    .from("clients")
    .select(`
      *,
      audits(
        id, status, final_tier, total_opportunity_gbp,
        flagged_for_review, created_at, audit_run_at, sent_at
      )
    `)
    .eq("id", params.id)
    .is("deleted_at", null)
    .single();

  if (error || !client) notFound();

  const { data: activity } = await supabase
    .from("audit_log")
    .select("*")
    .eq("entity_id", params.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const audits = (client.audits ?? []) as Array<{
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
      {/* Back nav */}
      <Link
        href="/clients"
        className="mb-4 inline-flex items-center gap-1 text-xs text-[--text-tertiary] hover:text-[--text-secondary]"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to clients
      </Link>

      {/* Header */}
      <div className="mb-6 border-b border-[--border] pb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-[--text-primary]">
                {client.business_name}
              </h1>
              {client.sector && (
                <Badge variant="neutral">
                  {SECTOR_LABELS[client.sector] ?? client.sector}
                </Badge>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-4 text-sm text-[--text-secondary]">
              {client.owner_name && <span>{client.owner_name}</span>}
              <span>{client.email}</span>
              {client.phone && <span>{client.phone}</span>}
              {client.website_url && (
                <a
                  href={client.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[--accent] hover:underline"
                >
                  {client.website_url}
                </a>
              )}
            </div>
          </div>
          <Button variant="secondary" size="md">
            <Plus className="h-4 w-4" />
            New audit
          </Button>
        </div>
      </div>

      {/* Tabs content */}
      <ClientDetailTabs
        client={client}
        audits={audits}
        activity={activity ?? []}
        fmt={fmt}
      />
    </div>
  );
}
