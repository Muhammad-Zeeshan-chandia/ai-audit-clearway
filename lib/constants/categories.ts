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

/**
 * Normalises an incoming category score to the app's 1–5 scale.
 *
 * The n8n audit engine emits scores on a 0–100 scale (higher = better /
 * less opportunity). The app stores 1–5 (1 = best, 5 = worst). The bands are
 * inverted and chosen so the resulting RAG matches the engine's:
 *   >70 → GREEN (1–2), 40–70 → AMBER (3), <40 → RED (4–5).
 * Values already within 1–5 are passed through unchanged.
 */
export function NORMALIZE_SCORE(raw: number): number {
  if (Number.isInteger(raw) && raw >= 1 && raw <= 5) return raw;
  const s = Math.max(0, Math.min(100, raw));
  if (s >= 85) return 1;
  if (s > 70) return 2;
  if (s >= 40) return 3;
  if (s >= 20) return 4;
  return 5;
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

/**
 * Coerces an incoming final_tier to a valid app tier.
 *
 * Uses the engine's value if it matches one of the canonical tiers
 * (case-insensitively); otherwise derives the tier from the total
 * opportunity GBP via SUGGEST_TIER. Guarantees a value the DB's
 * audits_final_tier_check constraint accepts (or null).
 */
export function NORMALIZE_TIER(
  raw: string | null | undefined,
  totalGbp: number | null | undefined
): string | null {
  if (raw) {
    const match = TIERS.find((t) => t.toLowerCase() === raw.trim().toLowerCase());
    if (match) return match;
  }
  return SUGGEST_TIER(totalGbp);
}
