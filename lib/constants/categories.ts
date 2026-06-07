export type CategoryNumber = 1 | 2 | 3 | 4 | 5 | 6;

export interface Category {
  number: CategoryNumber;
  name: string;
  shortName: string;
  description: string;
}

export const CATEGORIES: Readonly<Category[]> = [
  { number: 1, name: "Lead Capture & Inbound",       shortName: "Lead Capture", description: "How new customers find the business and where leads first arrive." },
  { number: 2, name: "Customer Communication",       shortName: "Comms",        description: "How the business talks to enquiries and customers — speed, channels, follow-up." },
  { number: 3, name: "Booking & Scheduling",         shortName: "Booking",      description: "How customers book or schedule with the business; no-shows, cancellations." },
  { number: 4, name: "Sales Conversion",             shortName: "Sales",        description: "Turning enquiries into paying customers; quoting, closing, upsells." },
  { number: 5, name: "Retention & Repeat Revenue",   shortName: "Retention",    description: "Keeping customers, getting them back, reviews and referrals." },
  { number: 6, name: "Internal Operations",          shortName: "Operations",   description: "Tech stack, manual admin, data silos, team workflows." },
] as const;

export function SCORE_TO_RAG(score: number | null | undefined): "GREEN" | "AMBER" | "RED" | null {
  if (score == null) return null;
  if (score <= 2) return "GREEN";
  if (score === 3) return "AMBER";
  return "RED";
}

export const RAG_COLORS = {
  GREEN: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500", border: "border-emerald-200" },
  AMBER: { bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-500",   border: "border-amber-200"   },
  RED:   { bg: "bg-rose-100",    text: "text-rose-700",    dot: "bg-rose-500",    border: "border-rose-200"    },
} as const;

export function SUGGEST_TIER(totalGbp: number | null | undefined): string | null {
  if (totalGbp == null) return null;
  if (totalGbp < 20_000)  return "Starter";
  if (totalGbp < 50_000)  return "Standard";
  if (totalGbp < 100_000) return "Growth";
  if (totalGbp < 200_000) return "Established";
  return "Enterprise";
}

export const TIERS = ["Starter", "Standard", "Growth", "Established", "Enterprise"] as const;
export type Tier = typeof TIERS[number];
