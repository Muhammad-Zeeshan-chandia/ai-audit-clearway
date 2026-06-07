import { createClient } from "@/lib/supabase/server";
import { NewClientForm } from "./new-client-form";
import type { FieldDefinition } from "@/lib/types";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function NewClientPage() {
  const supabase = createClient();

  const { data: fields } = await supabase
    .from("field_definitions")
    .select("*")
    .eq("entity", "client")
    .eq("active", true)
    .order("display_order", { ascending: true });

  return (
    <div>
      <div className="mb-6 border-b border-[--border] pb-4">
        <Link
          href="/clients"
          className="mb-2 inline-flex items-center gap-1 text-xs text-[--text-tertiary] hover:text-[--text-secondary]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to clients
        </Link>
        <h1 className="text-xl font-semibold text-[--text-primary]">New client</h1>
        <p className="mt-1 text-sm text-[--text-secondary]">
          Create a client record, upload the discovery call transcript, and send the questionnaire link.
        </p>
      </div>

      <div className="max-w-2xl">
        <NewClientForm fields={(fields ?? []) as FieldDefinition[]} />
      </div>
    </div>
  );
}
