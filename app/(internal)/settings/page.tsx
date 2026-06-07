import Link from "next/link";
import { Layers, Palette, Users, Activity } from "lucide-react";

const items = [
  {
    href: "/settings/fields",
    icon: Layers,
    title: "Field manager",
    description: "Add, edit, reorder, or deactivate fields on the client form and questionnaire — no code change.",
  },
  {
    href: "/settings/branding",
    icon: Palette,
    title: "Branding",
    description: "Brand name and accent colour applied across the app.",
  },
  {
    href: "/settings/staff",
    icon: Users,
    title: "Staff & access",
    description: "Invite staff members and manage their roles.",
  },
  {
    href: "/settings/health",
    icon: Activity,
    title: "System health",
    description: "Queue depths, recent webhook failures, average audit run time, and pending GDPR deletions.",
  },
];

export default function SettingsPage() {
  return (
    <div>
      <div className="mb-6 border-b border-[--border] pb-4">
        <h1 className="text-xl font-semibold text-[--text-primary]">Settings</h1>
        <p className="mt-1 text-sm text-[--text-secondary]">
          Manage fields, branding, staff, and system configuration.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ href, icon: Icon, title, description }) => (
          <Link
            key={href}
            href={href}
            className="flex items-start gap-4 rounded-md border border-[--border] bg-[--bg-primary] p-4 hover:bg-[--bg-secondary] transition-colors"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[--accent-light]">
              <Icon className="h-5 w-5 text-[--accent]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[--text-primary]">{title}</p>
              <p className="mt-0.5 text-xs text-[--text-secondary]">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
