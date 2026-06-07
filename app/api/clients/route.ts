import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendClientInviteEmail } from "@/lib/email";

// GET /api/clients?page=1&search=&sector=&from=&to=
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const params = request.nextUrl.searchParams;

  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10));
  const pageSize = 50;
  const search = params.get("search")?.trim() ?? "";
  const sector = params.get("sector")?.trim() ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("clients")
    .select(
      `id, email, business_name, owner_name, sector, created_at, deleted_at,
       audits(id, status)`,
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (search) {
    query = query.or(`business_name.ilike.%${search}%,email.ilike.%${search}%`);
  }
  if (sector) {
    query = query.eq("sector", sector);
  }
  if (from) {
    query = query.gte("created_at", from);
  }
  if (to) {
    query = query.lte("created_at", to + "T23:59:59Z");
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ clients: data, total: count ?? 0, page, pageSize });
}

// POST /api/clients — multipart/form-data
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const serviceClient = createServiceClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const fieldsRaw = formData.get("fields");
  if (!fieldsRaw || typeof fieldsRaw !== "string") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  let fields: Record<string, unknown>;
  try {
    fields = JSON.parse(fieldsRaw);
  } catch {
    return NextResponse.json({ error: "Invalid fields JSON" }, { status: 400 });
  }

  const file = formData.get("transcript") as File | null;

  if (!fields.email || !fields.business_name) {
    return NextResponse.json({ error: "email and business_name are required" }, { status: 400 });
  }

  // Consent must be captured
  if (!fields.consent_captured) {
    return NextResponse.json({ error: "Consent must be captured" }, { status: 400 });
  }

  // 1. Insert client
  const { data: client, error: clientError } = await serviceClient
    .from("clients")
    .insert({
      email: (fields.email as string).toLowerCase().trim(),
      business_name: fields.business_name as string,
      owner_name: (fields.owner_name as string) || null,
      phone: (fields.phone as string) || null,
      sector: (fields.sector as string) || null,
      website_url: (fields.website_url as string) || null,
      call_date: (fields.call_date as string) || null,
      shay_notes: (fields.shay_notes as string) || null,
      consent_captured: true,
      consent_captured_at: new Date().toISOString(),
      created_by: user.id,
    })
    .select("id, email, business_name, owner_name")
    .single();

  if (clientError) {
    if (clientError.code === "23505") {
      return NextResponse.json({ error: "A client with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: clientError.message }, { status: 500 });
  }

  // 2. Create audit row
  const { data: audit, error: auditError } = await serviceClient
    .from("audits")
    .insert({
      client_id: client.id,
      status: "awaiting_questionnaire",
    })
    .select("id")
    .single();

  if (auditError) {
    return NextResponse.json({ error: auditError.message }, { status: 500 });
  }

  // 3. Upload transcript if provided
  let transcriptPath: string | null = null;

  if (file && file.size > 0) {
    const ext = file.name.split(".").pop() ?? "docx";
    const storagePath = `${client.id}/${audit.id}/transcript.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await serviceClient.storage
      .from("transcripts")
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (!uploadError) {
      transcriptPath = storagePath;
      await serviceClient
        .from("audits")
        .update({ transcript_path: storagePath })
        .eq("id", audit.id);
    }
  }

  // 4. Generate magic link for client questionnaire
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectTo = `${appUrl}/portal/questionnaire/${audit.id}`;

  const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
    type: "magiclink",
    email: client.email,
    options: { redirectTo },
  });

  // 5. Send invite email (only if link generation succeeded and Resend key is set)
  if (!linkError && linkData?.properties?.action_link && process.env.RESEND_API_KEY) {
    try {
      await sendClientInviteEmail({
        to: client.email,
        businessName: client.business_name,
        ownerName: client.owner_name,
        magicLink: linkData.properties.action_link,
      });
    } catch {
      // Email failure is non-fatal — log and continue
    }
  }

  // 6. Log to audit_log
  await serviceClient.from("audit_log").insert({
    actor_id: user.id,
    action: "client.created",
    entity_type: "client",
    entity_id: client.id,
    metadata: {
      audit_id: audit.id,
      business_name: client.business_name,
      transcript_uploaded: Boolean(transcriptPath),
      magic_link_sent: !linkError,
    },
  });

  return NextResponse.json({ clientId: client.id, auditId: audit.id }, { status: 201 });
}
