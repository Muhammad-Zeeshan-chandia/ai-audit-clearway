/**
 * GDPR Auto-Delete Cron — runs daily.
 *
 * For each audit sent 30+ days ago and not yet deleted:
 *   1. Delete transcript + PDF files from Supabase Storage.
 *   2. Nullify transcript_path, pdf_path on the audit row.
 *   3. Soft-delete the audit (deleted_at = now()).
 *
 * Then, for each client whose newest sent audit is 30+ days old:
 *   4. Anonymise PII: email → placeholder, phone/owner_name → null.
 *   5. Delete their Supabase auth user.
 *   6. Soft-delete the client row.
 *
 * Audit categories (scores) are intentionally preserved for internal reporting.
 * Protected by CRON_SECRET header, never by session auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fireDeletionConfirmationWebhook } from "@/lib/n8n";

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // If CRON_SECRET is not configured, only allow requests from localhost
    const host = request.headers.get("host") ?? "";
    return host.startsWith("localhost") || host.startsWith("127.0.0.1");
  }
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const results = { audits_processed: 0, files_deleted: 0, clients_anonymised: 0, errors: [] as string[] };

  // ── Step 1-3: Find and process old audits ──
  const { data: oldAudits, error: fetchErr } = await service
    .from("audits")
    .select("id, client_id, transcript_path, pdf_path")
    .lt("sent_at", cutoff)
    .is("deleted_at", null)
    .not("sent_at", "is", null);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  for (const audit of oldAudits ?? []) {
    // Delete files from storage
    for (const [bucket, path] of [
      ["transcripts", audit.transcript_path],
      ["pdfs", audit.pdf_path],
    ] as [string, string | null][]) {
      if (!path) continue;
      const { error } = await service.storage.from(bucket).remove([path]);
      if (error) {
        results.errors.push(`Storage delete ${bucket}/${path}: ${error.message}`);
      } else {
        results.files_deleted++;
      }
    }

    // Soft-delete the audit and clear file paths
    await service
      .from("audits")
      .update({ deleted_at: now, transcript_path: null, pdf_path: null })
      .eq("id", audit.id);

    results.audits_processed++;
  }

  // ── Step 4-6: Anonymise clients whose all audits are now 30+ days old ──
  // A client is eligible if they have NO non-deleted audits that are either:
  // - unsent (still in progress), OR
  // - sent within the last 30 days
  const { data: eligibleClients, error: clientErr } = await service
    .from("clients")
    .select("id, email, owner_name")
    .is("deleted_at", null)
    .not("email", "like", "gdpr-deleted-%"); // skip already anonymised

  if (clientErr) {
    results.errors.push(`Client fetch: ${clientErr.message}`);
  }

  for (const client of eligibleClients ?? []) {
    // Check: does this client have any active (non-deleted) or recent audits?
    const { count } = await service
      .from("audits")
      .select("*", { count: "exact", head: true })
      .eq("client_id", client.id)
      .is("deleted_at", null) // non-deleted audit exists = still active
      .gte("sent_at", cutoff); // OR sent recently

    // Also check for non-sent audits (in-progress)
    const { count: inProgressCount } = await service
      .from("audits")
      .select("*", { count: "exact", head: true })
      .eq("client_id", client.id)
      .is("deleted_at", null)
      .is("sent_at", null);

    if ((count ?? 0) > 0 || (inProgressCount ?? 0) > 0) {
      // Client still has active data — skip
      continue;
    }

    // Anonymise: replace email with non-identifiable placeholder
    const placeholder = `gdpr-deleted-${client.id}@anonymised.internal`;

    fireDeletionConfirmationWebhook(
      {
        client_email: client.email,
        client_name: "owner_name" in client ? (client as Record<string, unknown>).owner_name as string | null : null,
        grace_ends_at: now,
      },
      null
    ).catch((err) => console.error("[auto-delete] deletion confirmation webhook error:", err));

    await service
      .from("clients")
      .update({
        email: placeholder,
        phone: null,
        owner_name: null,
        deleted_at: now,
      })
      .eq("id", client.id);

    // Delete the Supabase auth user (find by original email)
    const { data: authUsers } = await service.auth.admin.listUsers();
    const authUser = authUsers?.users?.find((u) => u.email === client.email);
    if (authUser) {
      await service.auth.admin.deleteUser(authUser.id);
    }

    results.clients_anonymised++;
  }

  // Audit log
  await service.from("audit_log").insert({
    actor_id: null,
    action: "gdpr.auto_delete_ran",
    entity_type: "system",
    entity_id: null,
    metadata: results,
  });

  return NextResponse.json({ ok: true, ...results });
}
