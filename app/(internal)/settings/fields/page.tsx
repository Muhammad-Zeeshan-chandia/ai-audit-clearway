import { createClient } from "@/lib/supabase/server";
import { FieldsManager } from "./fields-manager";
import type { FieldDefinition } from "@/lib/types";

export default async function SettingsFieldsPage() {
  const supabase = createClient();

  const [{ data: clientFields }, { data: questionnaireFields }] = await Promise.all([
    supabase
      .from("field_definitions")
      .select("*")
      .eq("entity", "client")
      .order("display_order", { ascending: true }),
    supabase
      .from("field_definitions")
      .select("*")
      .eq("entity", "questionnaire")
      .order("display_order", { ascending: true }),
  ]);

  return (
    <div>
      <div className="mb-6 border-b border-[--border] pb-4">
        <h1 className="text-xl font-semibold text-[--text-primary]">Field manager</h1>
        <p className="mt-1 text-sm text-[--text-secondary]">
          Add, edit, or reorder fields on the client form and questionnaire. Changes take effect immediately — no code change required.
        </p>
      </div>

      <FieldsManager
        initialClientFields={(clientFields ?? []) as FieldDefinition[]}
        initialQuestionnaireFields={(questionnaireFields ?? []) as FieldDefinition[]}
      />
    </div>
  );
}
