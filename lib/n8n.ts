import { createHmac } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

function sign(body: string): string {
  const secret = process.env.N8N_WEBHOOK_SECRET ?? "";
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(body: string, signature: string): boolean {
  // Strip "sha256=" prefix if present (standard webhook convention)
  const sig = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  const expected = sign(body);
  if (expected.length !== sig.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return mismatch === 0;
}

export interface AuditEnginePayload {
  audit_id: string;                       // the audit to write results to (always new audit on rebuild)
  previous_audit_id: string | null;       // null on initial run, set on rebuilds
  client_id: string;
  rebuild_count: number;                  // 0 on initial run, 1+ on rebuilds
  transcript_path: string | null;
  website_url: string | null;
  questionnaire: Record<string, unknown>; // questionnaire.data jsonb
  client_meta: {
    business_name: string;
    sector: string | null;
    owner_name: string | null;
  };
  discovery_call: Record<string, unknown> | null;
  client_followups: Array<{
    id: string;
    response_text: string;
    source: "email_form" | "manual";
    submitted_at: string;
  }>;
  followup_answers: Array<{
    category_number: number | null;
    question_text: string;
    answer_text: string;
  }>;
  run_stage: "initial" | "final";
  review_notes: string | null;            // null on initial run, set on rebuilds
  callback_url: string;
}

export interface SendQuestionnairePayload {
  audit_id: string;
  client_email: string;
  client_name: string | null;
  business_name: string;
  magic_link: string;
  is_resend: boolean;         // false = initial send, true = re-send
}

export interface EmailFollowupPayload {
  audit_id: string;
  client_email: string;
  client_name: string | null;
  business_name: string;
  magic_link: string;
  questions_by_category: Array<{
    category_number: number;
    category_name: string;
    questions: string[];
  }>;
}

export interface DeletionConfirmationPayload {
  client_email: string;
  client_name: string | null;
  grace_ends_at: string;      // ISO timestamp
}

/**
 * Generates a Supabase magic link for the given email that, when clicked,
 * authenticates the user and redirects to nextPath.
 */
export async function generateMagicLink(
  service: SupabaseClient,
  email: string,
  nextPath: string
): Promise<string | null> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { data, error } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${appUrl}/auth/callback` },
  });
  if (error || !data?.properties?.hashed_token) return null;
  return `${appUrl}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(nextPath)}`;
}

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Direct, passwordless link to the client questionnaire. No auth — the token
 * is the credential. This is what we email clients (delivered by n8n).
 */
export function clientQuestionnaireUrl(accessToken: string): string {
  return `${appBaseUrl()}/q/${accessToken}`;
}

/**
 * Direct, passwordless link to the client follow-up page.
 */
export function clientFollowupUrl(accessToken: string): string {
  return `${appBaseUrl()}/f/${accessToken}`;
}

async function fireWebhook(
  urlEnvKey: string,
  payload: unknown,
  auditId: string | null
): Promise<void> {
  const url = process.env[urlEnvKey];
  const service = createServiceClient();

  if (!url) {
    console.warn(`[n8n] ${urlEnvKey} not set — skipping webhook`);
    await service.from("webhook_logs").insert({
      direction: "outgoing",
      endpoint: null,
      payload,
      response_status: null,
      response_body: `SKIPPED: ${urlEnvKey} not configured`,
      audit_id: auditId,
    });
    return;
  }

  const body = JSON.stringify(payload);
  const signature = sign(body);
  let responseStatus: number | null = null;
  let responseBody: string | null = null;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Clearway-Signature": signature },
      body,
    });
    responseStatus = res.status;
    responseBody = await res.text();
  } catch (err) {
    responseBody = `Fetch error: ${String(err)}`;
  }

  await service.from("webhook_logs").insert({
    direction: "outgoing",
    endpoint: url,
    payload,
    response_status: responseStatus,
    response_body: responseBody,
    audit_id: auditId,
  });
}

/**
 * Loads everything the audit engine needs to build (or rebuild) an audit and
 * returns it shaped as AuditEnginePayload. `auditId` is the audit to WRITE to
 * (i.e. the new audit row on rebuild). `previousAuditId` is the row to source
 * context from — pass the same id as `auditId` on initial run.
 */
export async function buildAuditEnginePayload(
  service: SupabaseClient,
  args: {
    auditId: string;
    previousAuditId: string;
    rebuildCount: number;
    runStage: "initial" | "final";
    reviewNotes: string | null;
    callbackUrl: string;
  }
): Promise<AuditEnginePayload | null> {
  const { auditId, previousAuditId, rebuildCount, runStage, reviewNotes, callbackUrl } = args;

  const { data: newAudit } = await service
    .from("audits")
    .select("id, client_id, transcript_path, clients(business_name, sector, owner_name, website_url)")
    .eq("id", auditId)
    .single();

  if (!newAudit) return null;

  type ClientShape = { business_name: string; sector: string | null; owner_name: string | null; website_url: string | null };
  const rawClients = newAudit.clients as ClientShape[] | null;
  const client = Array.isArray(rawClients) ? rawClients[0] : (rawClients as unknown as ClientShape | null);
  if (!client) return null;

  // Latest questionnaire for the new audit (copied forward on rebuild)
  const { data: questionnaire } = await service
    .from("questionnaires")
    .select("data")
    .eq("audit_id", auditId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: discoveryCall } = await service
    .from("discovery_calls")
    .select("*")
    .eq("audit_id", auditId)
    .maybeSingle();

  // Free-text follow-ups (history) + the client's per-question answers
  const { data: followups } = await service
    .from("client_followups")
    .select("id, response_text, source, submitted_at")
    .eq("audit_id", previousAuditId)
    .order("submitted_at", { ascending: true });

  const { data: answers } = await service
    .from("followup_answers")
    .select("category_number, question_text, answer_text")
    .eq("audit_id", auditId)
    .order("category_number", { ascending: true });

  return {
    audit_id: auditId,
    previous_audit_id: previousAuditId === auditId ? null : previousAuditId,
    client_id: newAudit.client_id,
    rebuild_count: rebuildCount,
    transcript_path: newAudit.transcript_path as string | null,
    website_url: client.website_url,
    questionnaire: (questionnaire?.data ?? {}) as Record<string, unknown>,
    client_meta: {
      business_name: client.business_name,
      sector: client.sector,
      owner_name: client.owner_name,
    },
    discovery_call: discoveryCall ? (discoveryCall as unknown as Record<string, unknown>) : null,
    client_followups: (followups ?? []) as AuditEnginePayload["client_followups"],
    followup_answers: (answers ?? []) as AuditEnginePayload["followup_answers"],
    run_stage: runStage,
    review_notes: reviewNotes,
    callback_url: callbackUrl,
  };
}

// Run 1 of 2 — initial audit (produces questions, no PDF).
export async function fireInitialAuditWebhook(
  payload: AuditEnginePayload,
  auditId: string
): Promise<void> {
  return fireWebhook("N8N_INITIAL_AUDIT_WEBHOOK_URL", payload, auditId);
}

// Run 2 of 2 — final audit with full context (no questions, no PDF).
export async function fireFinalAuditWebhook(
  payload: AuditEnginePayload,
  auditId: string
): Promise<void> {
  return fireWebhook("N8N_FINAL_AUDIT_WEBHOOK_URL", payload, auditId);
}

export async function fireSendAuditWebhook(
  payload: {
    audit_id: string;
    client_email: string;
    client_name: string | null;
    business_name: string;
    pdf_path: string | null;
    executive_summary: string | null;
    final_tier: string | null;
    total_opportunity_gbp: number | null;
  },
  auditId: string
): Promise<void> {
  return fireWebhook("N8N_SEND_AUDIT_WEBHOOK_URL", payload, auditId);
}

export async function fireSendQuestionnaireWebhook(
  payload: SendQuestionnairePayload,
  auditId: string
): Promise<void> {
  return fireWebhook("N8N_SEND_QUESTIONNAIRE_WEBHOOK_URL", payload, auditId);
}

// "Ask Questions" — emails the client a magic link to the questions page.
export async function fireAskQuestionsWebhook(
  payload: EmailFollowupPayload,
  auditId: string
): Promise<void> {
  return fireWebhook("N8N_EMAIL_FOLLOWUP_WEBHOOK_URL", payload, auditId);
}

// "Generate PDF" — separate workflow; builds + stores the PDF, then calls
// /api/webhooks/pdf-ready.
export async function firePdfGenWebhook(
  payload: {
    audit_id: string;
    callback_url: string;
    categories: Array<{ category_number: number; category_name: string; report_section: string | null }>;
    executive_summary: string | null;
    final_tier: string | null;
    total_opportunity_gbp: number | null;
  },
  auditId: string
): Promise<void> {
  return fireWebhook("N8N_PDF_GEN_WEBHOOK_URL", payload, auditId);
}

export async function fireDeletionConfirmationWebhook(
  payload: DeletionConfirmationPayload,
  auditId: string | null
): Promise<void> {
  return fireWebhook("N8N_DELETION_CONFIRMATION_WEBHOOK_URL", payload, auditId);
}
