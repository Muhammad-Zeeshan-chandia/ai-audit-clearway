/**
 * GDPR Deletion Request Processor — runs daily.
 *
 * Finds pending deletion requests where grace_ends_at has passed
 * and hard-deletes all data for those clients.
 *
 * Hard delete order (respecting FK constraints):
 *   1. audit_categories (cascades from audits)
 *   2. questionnaires (cascades from audits)
 *   3. audits (cascades from clients)
 *   4. gdpr_deletion_requests (cascades from clients)
 *   5. clients
 *   6. public.users (cascades from auth.users)
 *   7. auth.users (delete last — this cascades to public.users)
 *
 * Supabase's ON DELETE CASCADE handles most of steps 1-4 automatically
 * when we delete the client row.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    const host = request.headers.get("host") ?? "";
    return host.startsWith("localhost") || host.startsWith("127.0.0.1");
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const now = new Date().toISOString();
  const results = { processed: 0, errors: [] as string[] };

  // Find requests where grace period has elapsed
  const { data: requests, error: fetchErr } = await service
    .from("gdpr_deletion_requests")
    .select("id, client_id, clients(id, email)")
    .eq("status", "pending")
    .lte("grace_ends_at", now);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  for (const req of requests ?? []) {
    const clientArr = req.clients as Array<{ id: string; email: string }> | null;
    const client = Array.isArray(clientArr)
      ? clientArr[0]
      : (clientArr as unknown as { id: string; email: string } | null);

    if (!client) continue;

    try {
      // Delete files from storage for all audits
      const { data: audits } = await service
        .from("audits")
        .select("transcript_path, pdf_path")
        .eq("client_id", client.id);

      for (const audit of audits ?? []) {
        if (audit.transcript_path) {
          await service.storage.from("transcripts").remove([audit.transcript_path]);
        }
        if (audit.pdf_path) {
          await service.storage.from("pdfs").remove([audit.pdf_path]);
        }
      }

      // Delete the Supabase auth user (cascades to public.users)
      const { data: authData } = await service.auth.admin.listUsers();
      const authUser = authData?.users?.find((u) => u.email === client.email);
      if (authUser) {
        await service.auth.admin.deleteUser(authUser.id);
      }

      // Hard delete client (cascades to audits, audit_categories,
      // questionnaires, gdpr_deletion_requests via ON DELETE CASCADE)
      await service.from("clients").delete().eq("id", client.id);

      // Mark request completed (it will cascade-delete with the client,
      // but we update it first in case of partial failures above)
      await service
        .from("gdpr_deletion_requests")
        .update({ status: "completed", completed_at: now })
        .eq("id", req.id);

      results.processed++;
    } catch (err) {
      results.errors.push(`Client ${client.id}: ${String(err)}`);
    }
  }

  // Audit log
  await service.from("audit_log").insert({
    actor_id: null,
    action: "gdpr.deletion_requests_processed",
    entity_type: "system",
    entity_id: null,
    metadata: results,
  });

  return NextResponse.json({ ok: true, ...results });
}
