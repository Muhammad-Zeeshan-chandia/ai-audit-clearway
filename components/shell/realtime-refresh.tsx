"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

// Tables whose changes should refresh the internal UI.
const TABLES = [
  "audits",
  "audit_categories",
  "clients",
  "notifications",
  "questionnaires",
  "discovery_calls",
  "client_followups",
  "proposals",
] as const;

/**
 * Keeps internal (staff) pages in sync without manual reloads.
 *
 * Subscribes to Postgres changes on the key tables and calls router.refresh()
 * (debounced) whenever anything changes — including audits completed by the
 * n8n callback. A slow interval acts as a fallback if realtime is unavailable.
 *
 * router.refresh() re-runs server components only; client-side state (e.g. a
 * form being edited) is preserved, so this won't interrupt in-progress edits.
 */
export function RealtimeRefresh() {
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => router.refresh(), 600);
    };

    const channel = supabase.channel("clearway-internal-sync");
    for (const table of TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        scheduleRefresh
      );
    }
    channel.subscribe();

    // Fallback: refresh periodically in case realtime is unavailable.
    const interval = setInterval(() => router.refresh(), 30_000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
