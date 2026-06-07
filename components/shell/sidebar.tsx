"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  ClipboardCheck,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients",   label: "Clients",   icon: Users },
  { href: "/audits",    label: "Audits",    icon: FileText },
  { href: "/reviews",   label: "Reviews",   icon: ClipboardCheck },
  { href: "/settings",  label: "Settings",  icon: Settings },
];

interface SidebarProps {
  userName: string;
  userEmail: string;
}

export function Sidebar({ userName, userEmail }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-[--border] bg-[--bg-primary]">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-[--border] px-5">
        <span className="text-base font-semibold text-[--accent] tracking-tight">
          Clearway AI
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <ul className="space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-[--accent-light] text-[--accent] font-medium"
                      : "text-[--text-secondary] hover:bg-[--bg-secondary] hover:text-[--text-primary]"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User menu */}
      <div className="border-t border-[--border] px-3 py-3">
        <div className="flex items-center gap-3 rounded-md px-3 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[--accent-light] text-xs font-semibold text-[--accent]">
            {(userName || userEmail).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[--text-primary]">
              {userName || userEmail}
            </p>
            <p className="truncate text-xs text-[--text-tertiary]">
              {userEmail}
            </p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-[--text-secondary] hover:bg-[--bg-secondary] hover:text-[--text-primary] transition-colors"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
