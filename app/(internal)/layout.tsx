import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/sidebar";
import { NotificationBell } from "@/components/shell/notification-bell";

export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, email, role")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  if (!["admin", "staff"].includes(profile.role)) redirect("/login");

  return (
    <div className="flex min-h-screen bg-[--bg-secondary]">
      <Sidebar userName={profile.full_name ?? ""} userEmail={profile.email} />

      <div className="ml-60 flex flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-end border-b border-[--border] bg-[--bg-primary] px-8">
          <NotificationBell />
        </header>

        <main className="flex-1 px-8 py-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
