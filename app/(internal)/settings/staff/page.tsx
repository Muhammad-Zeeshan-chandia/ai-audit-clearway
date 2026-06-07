import { createClient } from "@/lib/supabase/server";
import { StaffManager } from "./staff-manager";

export default async function StaffPage() {
  const supabase = createClient();
  const { data: rows } = await supabase
    .from("users")
    .select("id, email, full_name, role, created_at")
    .in("role", ["admin", "staff"])
    .order("created_at", { ascending: true });

  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div>
      <div className="mb-6 border-b border-[--border] pb-4">
        <h1 className="text-xl font-semibold text-[--text-primary]">Staff & access</h1>
        <p className="mt-1 text-sm text-[--text-secondary]">
          Invite staff members and manage their roles.
        </p>
      </div>
      <StaffManager
        staff={rows ?? []}
        currentUserId={user?.id ?? ""}
      />
    </div>
  );
}
