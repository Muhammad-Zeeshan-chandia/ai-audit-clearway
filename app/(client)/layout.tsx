import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/shell/sign-out-button";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "client") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-[--bg-secondary]">
      <header className="flex h-14 items-center justify-between border-b border-[--border] bg-[--bg-primary] px-6">
        <span className="text-base font-semibold text-[--accent]">
          Clearway AI
        </span>
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">{children}</main>
    </div>
  );
}
