import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifySignature, generateMagicLink, fireSendQuestionnaireWebhook } from "@/lib/n8n";

// POST /api/n8n/discovery-call
// Inbound from n8n internal form. Creates or updates the client record,
// finds or creates an awaiting_questionnaire audit, and persists the
// discovery_call row. Returns { ok, audit_id, client_id } so n8n can
// move the transcript file to the correct storage path.
// HMAC-protected — excluded from session auth by middleware.

interface DiscoveryCallPayload {
  client_email: string;
  business_name: string;
  owner_name?: string | null;
  client_phone?: string | null;
  sector?: string | null;
  website_url?: string | null;
  call_date: string;
  call_number: number;
  consent_captured: boolean;
  lead_source?: string | null;
  years_in_business?: number | null;
  turnover_band?: string | null;
  rough_enquiries_per_month?: number | null;
  rough_missed_calls_per_month?: number | null;
  rough_conversion_percent?: number | null;
  average_customer_value?: number | null;
  rough_admin_hours_per_week?: number | null;
  total_staff?: number | null;
  sites?: number | null;
  anything_else_worth_knowing?: string | null;
  transcript_path?: string | null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const signature = request.headers.get("X-Clearway-Signature") ?? "";
  if (process.env.N8N_WEBHOOK_SECRET && !verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: DiscoveryCallPayload;
  try {
    payload = JSON.parse(rawBody) as DiscoveryCallPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.client_email || !payload.business_name || !payload.call_date) {
    return NextResponse.json(
      { error: "client_email, business_name, and call_date are required" },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const email = payload.client_email.toLowerCase().trim();

  // 1. Upsert client by email
  const { data: existingClient } = await service
    .from("clients")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let clientId: string;

  if (existingClient) {
    clientId = existingClient.id;
    await service.from("clients").update({
      business_name: payload.business_name,
      ...(payload.owner_name !== undefined && { owner_name: payload.owner_name }),
      ...(payload.client_phone !== undefined && { phone: payload.client_phone }),
      ...(payload.sector !== undefined && { sector: payload.sector }),
      ...(payload.website_url !== undefined && { website_url: payload.website_url }),
    }).eq("id", clientId);
  } else {
    const { data: newClient, error: clientErr } = await service
      .from("clients")
      .insert({
        email,
        business_name: payload.business_name,
        owner_name: payload.owner_name ?? null,
        phone: payload.client_phone ?? null,
        sector: payload.sector ?? null,
        website_url: payload.website_url ?? null,
        consent_captured: payload.consent_captured,
        consent_captured_at: payload.consent_captured ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (clientErr || !newClient) {
      return NextResponse.json(
        { error: clientErr?.message ?? "Failed to create client" },
        { status: 500 }
      );
    }
    clientId = newClient.id;
  }

  // 2. Find or create an awaiting_questionnaire audit
  const { data: existingAudit } = await service
    .from("audits")
    .select("id")
    .eq("client_id", clientId)
    .eq("status", "awaiting_questionnaire")
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let auditId: string;

  if (existingAudit) {
    auditId = existingAudit.id;
    // Update transcript_path if provided
    if (payload.transcript_path) {
      await service.from("audits")
        .update({ transcript_path: payload.transcript_path })
        .eq("id", auditId);
    }
  } else {
    const { data: newAudit, error: auditErr } = await service
      .from("audits")
      .insert({
        client_id: clientId,
        status: "awaiting_questionnaire",
        is_current: true,
        transcript_path: payload.transcript_path ?? null,
      })
      .select("id")
      .single();

    if (auditErr || !newAudit) {
      return NextResponse.json(
        { error: auditErr?.message ?? "Failed to create audit" },
        { status: 500 }
      );
    }
    auditId = newAudit.id;
  }

  // 3. Upsert discovery_call (1:1 with audit, keyed on audit_id)
  const { error: callErr } = await service.from("discovery_calls").upsert(
    {
      audit_id: auditId,
      call_date: payload.call_date,
      call_number: payload.call_number,
      recording_consent_captured: payload.consent_captured,
      lead_source: payload.lead_source ?? null,
      years_in_business: payload.years_in_business ?? null,
      turnover_band: payload.turnover_band ?? null,
      rough_enquiries_per_month: payload.rough_enquiries_per_month ?? null,
      rough_missed_calls_per_month: payload.rough_missed_calls_per_month ?? null,
      rough_conversion_percent: payload.rough_conversion_percent ?? null,
      average_customer_value: payload.average_customer_value ?? null,
      rough_admin_hours_per_week: payload.rough_admin_hours_per_week ?? null,
      total_staff: payload.total_staff ?? null,
      sites: payload.sites ?? null,
      anything_else_worth_knowing: payload.anything_else_worth_knowing ?? null,
    },
    { onConflict: "audit_id" }
  );

  if (callErr) {
    return NextResponse.json({ error: callErr.message }, { status: 500 });
  }

  // 3b. Email the client their questionnaire magic link (delivered by n8n).
  //     Only meaningful while the audit is still awaiting its questionnaire.
  const { data: auditStatusRow } = await service
    .from("audits")
    .select("status")
    .eq("id", auditId)
    .single();

  let questionnaireSent = false;
  if (auditStatusRow?.status === "awaiting_questionnaire") {
    const magicLink = await generateMagicLink(
      service,
      email,
      `/portal/questionnaire/${auditId}`
    );

    if (magicLink) {
      questionnaireSent = true;
      fireSendQuestionnaireWebhook(
        {
          audit_id: auditId,
          client_email: email,
          client_name: payload.owner_name ?? null,
          business_name: payload.business_name,
          magic_link: magicLink,
          is_resend: Boolean(existingAudit),
        },
        auditId
      ).catch((err) =>
        console.error("[discovery-call] send-questionnaire webhook error:", err)
      );
    }
  }

  await service.from("audit_log").insert({
    actor_id: null,
    action: "audit.discovery_call_received",
    entity_type: "audit",
    entity_id: auditId,
    metadata: {
      client_id: clientId,
      call_date: payload.call_date,
      call_number: payload.call_number,
      consent_captured: payload.consent_captured,
      questionnaire_invite_sent: questionnaireSent,
    },
  });

  // 4. Notify staff
  const { data: staffUsers } = await service
    .from("users")
    .select("id")
    .in("role", ["admin", "staff"]);

  if ((staffUsers ?? []).length > 0) {
    await service.from("notifications").insert(
      (staffUsers ?? []).map((u) => ({
        user_id: u.id,
        type: "discovery_call_received",
        title: `Discovery call logged — ${payload.business_name}`,
        body: `Call #${payload.call_number} captured for ${payload.business_name}.`,
        link: `/audits/${auditId}`,
      }))
    );
  }

  return NextResponse.json({ ok: true, audit_id: auditId, client_id: clientId });
}
