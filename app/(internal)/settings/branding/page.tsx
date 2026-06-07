import { createClient } from "@/lib/supabase/server";
import { BrandingForm } from "./branding-form";

export default async function BrandingPage() {
  const supabase = createClient();

  const { data: rows } = await supabase
    .from("app_settings")
    .select("key, value");

  const settings: Record<string, string | null> = {};
  (rows ?? []).forEach(({ key, value }) => { settings[key] = value; });

  return (
    <div>
      <div className="mb-6 border-b border-[--border] pb-4">
        <h1 className="text-xl font-semibold text-[--text-primary]">Branding</h1>
        <p className="mt-1 text-sm text-[--text-secondary]">
          Brand name and accent colour. Changes take effect on the next page load.
        </p>
      </div>
      <div className="max-w-md">
        <BrandingForm settings={settings} />
      </div>
    </div>
  );
}
