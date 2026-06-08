import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

import { ClientsTable } from "./clients-table";
import type { AuditStatus } from "@/lib/types";
import { Plus } from "lucide-react";

const SECTORS = [
  { value: "restaurant",          label: "Restaurant" },
  { value: "clinic_dental",       label: "Dental / Clinic" },
  { value: "trades",              label: "Trades" },
  { value: "agency_consultancy",  label: "Agency / Consultancy" },
  { value: "retail_ecommerce",    label: "Retail / eCommerce" },
  { value: "gym_fitness",         label: "Gym / Fitness" },
  { value: "salon_beauty",        label: "Salon / Beauty" },
  { value: "hotel_hospitality",   label: "Hotel / Hospitality" },
  { value: "other",               label: "Other" },
];

type SearchParams = {
  page?: string;
  search?: string;
  sector?: string;
  from?: string;
  to?: string;
};

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createClient();

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 50;
  const search = searchParams.search?.trim() ?? "";
  const sector = searchParams.sector?.trim() ?? "";
  const from = searchParams.from ?? "";
  const to = searchParams.to ?? "";

  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("clients")
    .select(
      `id, email, business_name, owner_name, sector, created_at,
       audits(id, status)`,
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  // Use FTS (tsvector) for searches — falls back to ilike only if search_vector
  // column doesn't exist yet (handles cases where migration hasn't run).
  if (search) {
    query = query.textSearch("search_vector", search, {
      type: "plain",
      config: "english",
    });
  }
  if (sector) query = query.eq("sector", sector);
  if (from)   query = query.gte("created_at", from);
  if (to)     query = query.lte("created_at", to + "T23:59:59Z");

  const { data: rawClients, count } = await query;

  const clients = (rawClients ?? []).map((c) => {
    const audits = (c.audits ?? []) as Array<{ id: string; status: string }>;
    const lastStatus = audits.length > 0 ? audits[audits.length - 1].status : null;
    return {
      id: c.id,
      email: c.email,
      business_name: c.business_name,
      owner_name: c.owner_name,
      sector: c.sector,
      created_at: c.created_at,
      audit_count: audits.length,
      last_audit_status: lastStatus as AuditStatus | null,
    };
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between border-b border-[--border] pb-4">
        <div>
          <h1 className="text-xl font-semibold text-[--text-primary]">Clients</h1>
          <p className="mt-1 text-sm text-[--text-secondary]">
            Manage client records and start new audits.
          </p>
        </div>
        <Link href="/clients/new">
          <Button variant="primary" size="md">
            <Plus className="h-4 w-4" />
            New client
          </Button>
        </Link>
      </div>

      <ClientsTable
        clients={clients}
        total={count ?? 0}
        page={page}
        pageSize={pageSize}
        sectors={SECTORS}
        defaultSearch={search}
        defaultSector={sector}
      />
    </div>
  );
}
