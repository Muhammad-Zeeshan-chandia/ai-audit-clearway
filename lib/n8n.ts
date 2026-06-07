import { createHmac } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

function sign(body: string): string {
  const secret = process.env.N8N_WEBHOOK_SECRET ?? "";
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(body: string, signature: string): boolean {
  const expected = sign(body);
  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

interface RunAuditPayload {
  audit_id: string;
  client_id: string;
  transcript_path: string | null;
  website_url: string | null;
  questionnaire: Record<string, unknown>;
  client_meta: {
    business_name: string;
    sector: string | null;
    owner_name: string | null;
  };
  callback_url: string;
}

async function fireWebhook(
  urlEnvKey: string,
  payload: unknown,
  auditId: string
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

export async function fireRunAuditWebhook(
  payload: RunAuditPayload,
  auditId: string
): Promise<void> {
  return fireWebhook("N8N_RUN_AUDIT_WEBHOOK_URL", payload, auditId);
}

export async function fireSendAuditWebhook(
  payload: { audit_id: string; client_email: string; pdf_path: string | null },
  auditId: string
): Promise<void> {
  return fireWebhook("N8N_SEND_AUDIT_WEBHOOK_URL", payload, auditId);
}

export async function fireRerunAuditWebhook(
  payload: {
    audit_id: string;
    client_id: string;
    review_notes: string;
    callback_url: string;
  },
  auditId: string
): Promise<void> {
  return fireWebhook("N8N_RERUN_WEBHOOK_URL", payload, auditId);
}

export async function fireRegeneratePdfWebhook(
  payload: {
    audit_id: string;
    categories: Array<{ category_number: number; report_section: string }>;
    executive_summary?: string;
  },
  auditId: string
): Promise<void> {
  return fireWebhook("N8N_REGENERATE_PDF_WEBHOOK_URL", payload, auditId);
}
