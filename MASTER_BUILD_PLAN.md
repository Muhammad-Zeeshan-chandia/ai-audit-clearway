# Clearway AI Audit System — Master Build Plan
Version 1.0 · Last updated 8 June 2026

This is the single source of truth for picking up work on this project. Read this file end-to-end before making any change.

---

## 1. Product Overview

Clearway AI delivers diagnostic business audits to UK SMEs across 9 sectors (restaurant, clinic, trades, agency, retail, gym, salon, hotel, other). Three actors:

- **Staff** (roles: `admin`, `staff`) — run audits, review AI output, send to clients
- **Clients** — UK business owners receiving the audit
- **n8n** — workflow engine hosting the AI audit pipeline and all outbound email

End-to-end flow:

1. Staff have a discovery call with a prospect
2. Staff fill an Internal Form in n8n (transcript attached); n8n callbacks the app, which creates the client + audit + discovery_call records
3. Staff click "Send questionnaire" → app fires webhook to n8n → n8n emails the client a Supabase magic link to the audit questionnaire
4. Client submits questionnaire → app fires webhook to n8n's AI engine
5. n8n's engine runs 6 sub-agents over (transcript + questionnaire + discovery call + website scrape) → generates structured audit JSON → builds PDF → callbacks the app
6. Staff review in dashboard. Three branches:
   - Sub-agents flagged `insufficient_data` → click "Email follow-up" → client receives form → submits → status `followup_received`
   - Want to rebuild with notes → "Request changes" → archive old audit, create new, fire rebuild webhook
   - Happy → "Approve & Send" → app fires send-audit webhook → n8n emails PDF to client

---

## 2. Tech Stack

| Layer | Tool | Version/Notes |
|---|---|---|
| Web | Next.js | 14.2 App Router |
| Language | TypeScript | 5.x |
| UI | React + Tailwind 3.4 | Custom components in `components/ui/`, no shadcn |
| Forms | react-hook-form 7.77 + zod 4 | |
| DB & Auth | Supabase | project `gogtmnwnjyvpgbpcerjj`, EU region |
| Rate limit | Upstash Redis | |
| Workflows | n8n | self-hosted, hosts all outbound email |
| Email | n8n SMTP only | **Resend was removed in Phase A4** |
| Hosting | Vercel | |
| Repo root | `clearway-app/` | Next.js project. Migrations in `supabase/migrations/`. |

---

## 3. System Architecture

```
[Client browser] ←→ [Vercel/Next.js app] ←→ [Supabase Postgres + Storage + Auth]
       ↑                       ↕ HMAC
       └──── email ────── [n8n] ←→ [Anthropic Bedrock EU]
```

Communication boundaries:
- **App → n8n** (outbound webhooks): RUN_AUDIT, RERUN, SEND_AUDIT, SEND_QUESTIONNAIRE, EMAIL_FOLLOWUP, DELETION_CONFIRMATION
- **n8n → App** (inbound webhooks): `POST /api/n8n/discovery-call`, `POST /api/webhooks/audit-complete`

Both directions HMAC-signed using shared `N8N_WEBHOOK_SECRET`. Header: `X-Clearway-Signature: sha256={hex}`. Body for signature = raw request body.

---

## 4. Supabase Database Schema

11 tables in `public` schema.

### Tables

**clients**
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| email | text UNIQUE | |
| business_name | text NOT NULL | |
| owner_name | text | |
| phone | text | |
| sector | text | one of: Restaurant, Clinic, Trades, Agency, Retail, Gym, Salon, Hotel, Other |
| call_date | date | |
| consent_captured | bool | |
| consent_captured_at | timestamptz | |
| website_url | text | |
| shay_notes | text | legacy free-text from old internal form |
| search_vector | tsvector | for FTS |
| created_at / updated_at / deleted_at | timestamptz | |

**audits**
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| client_id | uuid → clients | |
| status | text | enum — see §6 |
| is_current | bool DEFAULT true | A1 |
| rebuild_count | int DEFAULT 0 | A1 |
| transcript_path | text | path in `transcripts` bucket |
| pdf_path | text | path in `pdfs` bucket |
| total_opportunity_gbp | numeric | sum of category gbp |
| audit_size_score | numeric | 0–100 |
| final_tier | text | small / mid / larger / serious / unqualified |
| tier_overridden | bool DEFAULT false | |
| flagged_for_review | bool | |
| flag_reasons | text[] | |
| executive_summary | text | |
| review_notes | text | admin-only, captured when archiving |
| reviewed_by | uuid → users | |
| reviewed_at | timestamptz | |
| questionnaire_submitted_at | timestamptz | |
| audit_run_at | timestamptz | |
| sent_at | timestamptz | |
| created_by | uuid → users | |
| created_at | timestamptz | |
| deleted_at | timestamptz | |

**audit_categories** (6 rows per audit, one per sub-agent)
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| audit_id | uuid → audits | |
| category_number | int 1–6 | |
| score | int 0–100 | |
| rag | text | red \| amber \| green |
| gbp_impact_annual | numeric | |
| insufficient_data | bool DEFAULT false | |
| missing_questions | text[] | A1 — populated when insufficient_data=true |
| evidence | text | what the agent observed |
| solution | text | recommendation |
| report_section | text | full markdown section for PDF |
| raw_response | jsonb | A1 — full agent JSON |
| model | text | A1 — e.g. "claude-sonnet-4-5" |
| latency_ms | int | A1 |
| prompt_version | text | A1 |
| error_text | text | A1 |
| created_at | timestamptz | |

**questionnaires**
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| audit_id | uuid → audits | |
| data | jsonb | keyed by canonical field keys (§5) |
| submitted_at | timestamptz | |

**discovery_calls** (A1, 1:1 with audit)
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| audit_id | uuid UNIQUE → audits | |
| call_date | date | |
| call_number | int | 1 = first call with this client |
| recording_consent_captured | bool NOT NULL | gates audit engine |
| years_in_business | int | |
| turnover_band | text | 100k \| 500k \| 1m \| 5m_plus |
| lead_source | text | how *they found Clearway* (not the client's own lead sources) |
| rough_enquiries_per_month | numeric | |
| rough_missed_calls_per_month | numeric | |
| rough_conversion_percent | numeric | |
| average_customer_value | numeric | |
| rough_admin_hours_per_week | numeric | |
| total_staff | int | |
| sites | int | physical locations |
| anything_else_worth_knowing | text | |
| created_at | timestamptz | |
| created_by | uuid → users | |

**client_followups** (A1, append-only history)
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| audit_id | uuid → audits | |
| response_text | text | |
| source | text | email_form \| manual |
| submitted_at | timestamptz | |
| submitted_by_user_id | uuid → users | null when source=email_form |

**field_definitions** (drives dynamic forms)
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| entity | text | client \| questionnaire \| discovery_call |
| field_key | text | canonical |
| label | text | |
| field_type | text | number, text, long_text, select, multiselect, boolean, email, date |
| required | bool | |
| display_order | int | |
| category | int 1–6 | A1, nullable — which sub-agent this field feeds |
| options | jsonb | for select/multiselect |
| help_text | text | |
| active | bool | inactive = deprecated, kept for history |
| UNIQUE (entity, field_key) | | |

**webhook_logs**, **audit_log**, **notifications**, **app_settings**, **gdpr_deletion_requests**, **users** — see existing migrations for schema. Key facts:
- `webhook_logs.direction` = "incoming" \| "outgoing"
- `users.role` enum: admin \| staff \| client
- `app_settings`: `brand_name` ("Clearway AI"), `brand_color` ("#0F766E"), `logo_url` (null)

### View

**v_audits_wide** — pivoted audit + client + questionnaire + per-category. Updated in A1 to include `is_current` and `rebuild_count`. Used by `/audits` list page.

### Storage Buckets
- `transcripts` — discovery call transcripts. Path: `transcripts/{client_id}/{audit_id}/transcript.docx`
- `pdfs` — generated audit PDFs. Path: `pdfs/{client_id}/{audit_id}/audit.pdf`

### Helper Functions
- `is_staff_or_admin()` SECURITY DEFINER — used in RLS

### Migrations Applied (chronological)
1. `001_create_core_tables`
2. `002_enable_rls_policies`
3. `003_create_storage_buckets`
4. `004_seed_field_definitions`
5. `005_seed_client_field_definitions`
6. `006_notifications_and_settings`
7. `007_gdpr_deletion_requests`
8. `008_fts_clients`
9. `005_prep_for_n8n` (v_audits_wide creation)
10. `010_phase_a1_schema_additions`
11. `011_phase_a2_field_key_standardization`

---

## 5. Canonical Field Key Registry

**These keys are the single source of truth.** They appear identically in:
- `field_definitions.field_key` rows in the DB
- `questionnaires.data` jsonb keys
- The Master Prompt Spec (the AI sub-agents reference them by these names)
- The dashboard's dynamic form rendering

### entity = questionnaire (19 active fields)

| display_order | key | type | required | category |
|---|---|---|---|---|
| 10 | `enquiries_per_month` | number | yes | 1 |
| 20 | `lead_sources` | multiselect | yes | 1 |
| 30 | `missed_calls_messages_per_month` | number | yes | 2 |
| 40 | `conversion_per_10_enquiries` | number 0–10 | yes | 4 |
| 50 | `response_time_to_enquiry` | select | yes | 2 |
| 60 | `avg_customer_value` | number (£) | yes | 4 |
| 70 | `profit_per_customer` | number (£) | no | 4 |
| 80 | `no_shows_per_month` | number | yes | 3 |
| 90 | `unchased_leads_per_month` | number | yes | 4 |
| 100 | `admin_hours_per_week` | number | yes | 6 |
| 110 | `customer_facing_staff` | number | yes | 6 |
| 120 | `tools_systems_used` | long_text | yes | 6 |
| 130 | `tools_share_data` | select | yes | 6 |
| 140 | `ai_tools_in_use` | long_text | no | 6 |
| 150 | `repeat_customer_percent` | number 0–100 | no | 5 |
| 160 | `email_sms_database` | select | yes | 5 |
| 170 | `lapsed_customers` | number | no | 5 |
| 180 | `customers_per_year` | number | yes | 5 |
| 190 | `fix_one_thing` | long_text | yes | 6 (highest signal — owner's stated priority) |

Select options:
- `response_time_to_enquiry`: `5_minutes` \| `1_hour` \| `24_hours` \| `1_to_3_days` \| `over_3_days` \| `varies`
- `tools_share_data`: `yes` \| `partly` \| `no`
- `email_sms_database`: `yes_active` \| `yes_dormant` \| `no`

Lead sources (multiselect): `phone_calls`, `website_forms`, `walk_ins`, `social_dms`, `referrals_word_of_mouth`, `paid_ads`, `outbound`, `other`

### entity = discovery_call

| key | type | category |
|---|---|---|
| `call_date` | date | — |
| `call_number` | number | — |
| `recording_consent_captured` | boolean | — |
| `years_in_business` | number | — |
| `turnover_band` | select (100k \| 500k \| 1m \| 5m_plus) | — |
| `lead_source` | text | — |
| `rough_enquiries_per_month` | number | 1 |
| `rough_missed_calls_per_month` | number | 2 |
| `rough_conversion_percent` | number | 4 |
| `average_customer_value` | number (£) | 4 |
| `rough_admin_hours_per_week` | number | 6 |
| `total_staff` | number | 6 |
| `sites` | number | 6 |
| `anything_else_worth_knowing` | long_text | — |

### entity = client

`email`, `business_name`, `owner_name`, `phone`, `sector`, `website_url`, `call_date`, `shay_notes` (legacy).

### Deprecated keys (active=false, do not use)

| Old key | New canonical key |
|---|---|
| `enquiry_sources` | `lead_sources` |
| `response_time_hours` | `response_time_to_enquiry` |
| `missed_calls_per_month` | `missed_calls_messages_per_month` |
| `conversion_rate_percent` | `conversion_per_10_enquiries` |
| `average_transaction_value_gbp` | `avg_customer_value` |
| `no_show_rate_percent` | `no_shows_per_month` (semantic: count not %) |
| `main_challenge` | `fix_one_thing` |
| `staff_count` | `customer_facing_staff` |
| `sites_count` | (moved to `discovery_calls.sites`) |
| `enquiry_tracking`, `follow_up_process`, `bookings_per_month`, `booking_method`, `upsell_process`, `has_loyalty_program`, `reviews_per_month`, `uses_crm` | dropped |

**Note**: n8n's Client Questionnaire form attached in the conversation history used different field names (e.g. `conversion_rate_pct`, `response_time`, `tools_used`, `tools_integrated`, `ai_tools_used`, `repeat_rate_pct`, `has_database`, `annual_customers`, `biggest_pain`, `missed_calls_per_month`). That form is now redundant since the dashboard's portal handles questionnaires natively via `field_definitions`. Either drop the n8n form, OR if kept, update every `fieldName` to match the canonical keys above.

---

## 6. Audit Status Lifecycle

```
[awaiting_questionnaire] ──(client submits)──→ [audit_running]
       ↑                                                │
   Send questionnaire                                   ↓
   (resend link, A4 button)                  [awaiting_review]
                                                  │     │
                                                  │     ↓
                                                  │  [awaiting_client_followup]
                                                  │     │ (client submits followup)
                                                  │     ↓
                                                  │  [followup_received]
                                                  ↓     │
                                       [approved] ←─────┘
                                            │ (Request Changes → archive old → new audit_running)
                                            ↓
                                         [sent]
```

Terminal/special:
- `failed` — n8n callback returned error
- `archived` — previous version after a rebuild (is_current=false)

Status → action-button visibility (built in A5):

| Status | Visible buttons |
|---|---|
| awaiting_questionnaire | Send questionnaire |
| audit_running | None (shows "Audit is running…" text) |
| awaiting_review | Approve, Request changes, Email follow-up (only if any category insufficient_data with missing_questions) |
| awaiting_client_followup | None (shows "Waiting for client follow-up…") |
| followup_received | Request changes, Approve, Email follow-up (if more flagged) |
| approved | Send audit |
| sent | None |
| archived | None |
| failed | None |

---

## 7. App API Routes Inventory

### Staff-auth (Supabase session, role check via middleware)

| Method + Path | Purpose |
|---|---|
| POST `/api/clients` | Create client + audit, generate magic link, fire SEND_QUESTIONNAIRE |
| PATCH/DELETE `/api/clients/[id]` | Edit/delete client |
| POST `/api/clients/[id]/audits` | New audit for existing client |
| POST `/api/clients/bulk-delete` | Bulk delete |
| POST `/api/audits/[id]/send-questionnaire` | Resend magic link, fire SEND_QUESTIONNAIRE |
| POST `/api/audits/[id]/email-followup` | Aggregate missing_questions, fire EMAIL_FOLLOWUP, status → awaiting_client_followup |
| POST `/api/audits/[id]/approve` | Fire SEND_AUDIT, status → sent |
| POST `/api/audits/[id]/request-changes` | Archive old + create new audit, fire RERUN; body: `{review_notes}` |
| POST `/api/audits/[id]/rerun` | Same archive-and-insert, no notes |
| PATCH `/api/audits/[id]/categories` | Edit category fields |
| POST `/api/audits/bulk-delete` | Bulk delete |
| GET `/api/audits/export` | CSV export |
| GET `/api/settings/staff`, POST `/api/settings/staff/[id]` | Staff invite/edit |
| GET `/api/cron/auto-delete` | GDPR cron (auth via CRON_SECRET) |

### Client-auth (Supabase magic-link session)

| Method + Path | Purpose |
|---|---|
| POST `/api/questionnaires/[audit_id]/submit` | Client submits questionnaire → fires RUN_AUDIT |
| POST `/api/followups/[audit_id]/submit` | Client submits follow-up → status `followup_received` |

### HMAC-auth (header `X-Clearway-Signature`)

| Method + Path | Purpose |
|---|---|
| POST `/api/n8n/discovery-call` | n8n internal-form sink: upserts client, archives current audit if any, creates new audit + discovery_call |
| POST `/api/webhooks/audit-complete` | n8n callback when audit engine finishes |

### Middleware path rules
- `/api/webhooks/*`, `/api/n8n/*`, `/api/cron/*` → bypass session auth (HMAC/secret protected)
- Everything else under `/api` → session required

---

## 8. n8n Webhook Contracts

### Env Vars (App side)

```
N8N_RUN_AUDIT_WEBHOOK_URL
N8N_RERUN_WEBHOOK_URL
N8N_SEND_AUDIT_WEBHOOK_URL
N8N_SEND_QUESTIONNAIRE_WEBHOOK_URL
N8N_EMAIL_FOLLOWUP_WEBHOOK_URL
N8N_DELETION_CONFIRMATION_WEBHOOK_URL
N8N_REGENERATE_PDF_WEBHOOK_URL    # exported by lib/n8n.ts but unused (PDF regen skipped)
N8N_WEBHOOK_SECRET                 # shared HMAC secret
```

### Payload Schemas (TypeScript)

```ts
// Outbound: AuditEnginePayload (RUN_AUDIT + RERUN)
interface AuditEnginePayload {
  audit_id: string;
  previous_audit_id: string | null;
  client_id: string;
  rebuild_count: number;
  transcript_path: string | null;
  website_url: string | null;
  questionnaire: Record<string, unknown>;  // questionnaires.data jsonb
  client_meta: {
    business_name: string;
    sector: string | null;
    owner_name: string | null;
  };
  discovery_call: Record<string, unknown> | null;
  client_followups: Array<{
    id: string;
    response_text: string;
    source: 'email_form' | 'manual';
    submitted_at: string;
  }>;
  review_notes: string | null;
  callback_url: string;
}

// Outbound: SEND_QUESTIONNAIRE
interface SendQuestionnairePayload {
  audit_id: string;
  client_email: string;
  client_name: string | null;
  business_name: string;
  magic_link: string;
  is_resend: boolean;
}

// Outbound: EMAIL_FOLLOWUP
interface EmailFollowupPayload {
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

// Outbound: DELETION_CONFIRMATION
interface DeletionConfirmationPayload {
  client_email: string;
  client_name: string | null;
  grace_ends_at: string;  // ISO
}

// Outbound: SEND_AUDIT
// (Built by app's approve route; check lib/n8n.ts fireSendAuditWebhook for exact shape — at minimum:)
interface SendAuditPayload {
  audit_id: string;
  client_email: string;
  client_name: string | null;
  business_name: string;
  pdf_path: string;
  executive_summary: string;
  final_tier: string;
  total_opportunity_gbp: number;
}

// Inbound: n8n internal-form sink
interface DiscoveryCallPayload {
  client_email: string;
  business_name: string;
  owner_name?: string | null;
  client_phone?: string | null;
  sector?: string | null;
  website_url?: string | null;
  call_date: string;          // YYYY-MM-DD
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

// Inbound: audit engine callback
interface AuditCompletePayload {
  audit_id: string;
  status: 'awaiting_review' | 'failed';
  categories: Array<{
    category_number: 1 | 2 | 3 | 4 | 5 | 6;
    score: number;            // 0-100
    rag: 'red' | 'amber' | 'green';
    gbp_impact_annual: number;
    insufficient_data: boolean;
    missing_questions: string[];   // populated when insufficient_data=true
    evidence: string;
    solution: string;
    report_section: string;        // markdown
    model: string;                 // e.g. 'claude-sonnet-4-5'
    latency_ms: number;
    raw_response: Record<string, unknown>;
    prompt_version: string;
  }>;
  total_opportunity_gbp: number;
  audit_size_score: number;
  final_tier: string;              // unqualified | small | mid | larger | serious
  executive_summary: string;
  flagged_for_review: boolean;
  flag_reasons: string[];
  pdf_path: string;
  error_text?: string;             // only when status='failed'
}
```

### HMAC Signing (both directions)

```ts
import crypto from 'crypto';
const signature = `sha256=${crypto.createHmac('sha256', N8N_WEBHOOK_SECRET).update(rawBody).digest('hex')}`;
// Set header: X-Clearway-Signature
```

Verifier in app: `lib/n8n.ts → verifySignature(rawBody, headerValue)`.

---

## 9. Build Phases — Done vs Remaining

### ✓ Done

| Phase | Description |
|---|---|
| A0 | Repo discovery (read-only) |
| A1 | Schema additions: `is_current`, `rebuild_count`, +2 statuses (`awaiting_client_followup`, `followup_received`), `audit_categories` telemetry cols (`missing_questions`, `model`, `latency_ms`, `raw_response`, `error_text`, `prompt_version`), `discovery_calls` table, `client_followups` table, `field_definitions.category` + `'discovery_call'` entity, `v_audits_wide` refresh. Migration `010`. |
| A2 | Field-key standardization to canonical names + `discovery_call` seed + badge.tsx fix + STATUSES/STATUS_LABELS expanded. Migration `011`. |
| A3 | Audit versioning behaviour: `request-changes`/`rerun` archive old + insert new; richer `AuditEnginePayload`; `buildAuditEnginePayload` helper in `lib/n8n.ts`; UI redirects to `new_audit_id`; client portal filters `is_current=true`; client detail caps audits to latest 3 with `totalAuditCount` caption. |
| A4 | Email rerouting: `lib/email.ts` deleted, `resend` package uninstalled; 3 new outbound firers (`fireSendQuestionnaireWebhook`, `fireEmailFollowupWebhook`, `fireDeletionConfirmationWebhook`); `generateMagicLink` helper; middleware allows `/api/n8n/*`; 4 new API routes: `send-questionnaire`, `email-followup`, `n8n/discovery-call`, `followups/[audit_id]/submit`. |
| A5 | UI: client portal followup page at `/portal/followup/[audit_id]` (server component + client form); status-aware audit-editor action buttons; amber "N questions needed" badges on category cards; Email Follow-up modal listing all flagged questions. |
| A6 | Discovery-call section (read-only 2-col grid + consent warning), follow-ups history list, version selector dropdown, archived-version banner on audit detail page. |
| A7 | App-side correctness pass before n8n wiring: (1) `verifySignature` strips `sha256=` prefix; (2) `api/n8n/discovery-call` fully rewritten — upserts client by email, correct discovery_call columns; (3) `api/webhooks/audit-complete` — score range 0–100, `missing_questions` + telemetry persisted, `status:'failed'` branch handled; (4) `EmailFollowupPayload` now sends `questions_by_category`; (5) `approve` route accepts `followup_received` + sends full `SendAuditPayload`. |

### ✗ Remaining

| Phase | Description |
|---|---|
| B1 | n8n workflow: Internal Form → `POST /api/n8n/discovery-call` |
| B2 | n8n workflow: Send Questionnaire email (webhook → SMTP) |
| B3 | n8n workflow: Send Audit email (webhook → SMTP w/ signed PDF link) |
| B4 | n8n workflow: Email Follow-up (webhook → SMTP with question list + magic link) |
| B5 | n8n workflow: Deletion Confirmation email |
| B6 | n8n workflow: **Main AI Audit Engine** (orchestrator + 6 sub-agents + audit-size scoring + PDF builder + callback) — triggered by both RUN_AUDIT and RERUN webhooks |
| B7 | Master Prompt Spec edit: add `missing_questions: string[]` to JSON output schema in shared system prompt (file: `CW_Master_Prompt_Spec_v1_060626.docx`, Section 5) |

---

## 10. n8n Workflow Specs

### B1 — Internal Form (Discovery Call intake)

**Trigger**: n8n Form Trigger node titled "Internal Form". Field names (must match `DiscoveryCallPayload`):

`client_email, business_name, owner_name, client_phone, sector, lead_source, call_date, call_number, years_in_business, turnover_band, consent_captured, rough_enquiries_per_month, rough_missed_calls_per_month, rough_conversion_percent, average_customer_value, rough_admin_hours_per_week, total_staff, sites, transcript_file (file upload, .docx), website_url, anything_else_worth_knowing`

**Nodes** (sequential):
1. Form Trigger
2. Supabase Storage upload — write `transcript_file` to bucket `transcripts` at temp path `transcripts/temp/{uuid()}.docx` (we don't have `client_id` yet)
3. Code node — compute HMAC SHA256 of JSON body with secret `N8N_WEBHOOK_SECRET`, prepend `sha256=`
4. HTTP Request — POST to `{NEXT_PUBLIC_APP_URL}/api/n8n/discovery-call`
   - Body: JSON matching `DiscoveryCallPayload`, include `transcript_path` from step 2
   - Headers: `Content-Type: application/json`, `X-Clearway-Signature: {sig from step 3}`
   - Expect 200 with `{ok, audit_id, client_id}`
5. Supabase Storage move — rename `transcripts/temp/{uuid}.docx` → `transcripts/{client_id}/{audit_id}/transcript.docx`
6. Supabase REST PATCH on `audits` table — set `transcript_path` to the new path
7. (Optional) Slack/notification to staff channel: "Discovery call captured for {business_name}"

### B2 — Send Questionnaire Email

**Trigger**: Webhook node listening on `N8N_SEND_QUESTIONNAIRE_WEBHOOK_URL`. Body = `SendQuestionnairePayload`.

**Nodes**:
1. Webhook trigger
2. Code node — verify `X-Clearway-Signature` against `N8N_WEBHOOK_SECRET`. Return 401 on mismatch.
3. Email node (SMTP)
   - To: `{client_email}`
   - Subject: `{is_resend ? "Reminder: " : ""}Your Clearway AI audit — quick questionnaire`
   - Body: greet `{client_name ?? "there"}`, mention `{business_name}`, CTA → `{magic_link}`
   - Plain text + HTML
4. Respond to webhook: `{ok: true}`

### B3 — Send Audit Email

**Trigger**: Webhook on `N8N_SEND_AUDIT_WEBHOOK_URL`. Body = `SendAuditPayload`.

**Nodes**:
1. Webhook trigger
2. Verify signature
3. Supabase Storage — generate signed URL for `{pdf_path}`, expiry 30 days
4. Email node
   - To: `{client_email}`
   - Subject: `Your Clearway AI audit is ready — {business_name}`
   - Attach PDF (or just link if size > 10MB)
   - HTML body: executive summary teaser + tier badge + total opportunity figure + CTA "Read your full audit"
5. Respond to webhook

### B4 — Email Follow-up

**Trigger**: Webhook on `N8N_EMAIL_FOLLOWUP_WEBHOOK_URL`. Body = `EmailFollowupPayload`.

**Nodes**:
1. Webhook trigger
2. Verify signature
3. Code node — build email body: for each item in `questions_by_category`, render `<h3>{category_name}</h3><ol>{questions...}</ol>`. Big CTA → `{magic_link}`.
4. Email node
   - To: `{client_email}`
   - Subject: `A few quick questions to finalise your audit — {business_name}`
   - Body: from step 3
5. Respond to webhook

### B5 — Deletion Confirmation

**Trigger**: Webhook on `N8N_DELETION_CONFIRMATION_WEBHOOK_URL`. Body = `DeletionConfirmationPayload`.

**Nodes**:
1. Webhook trigger
2. Verify signature
3. Email node
   - To: `{client_email}`
   - Subject: `Your Clearway data is scheduled for deletion`
   - Body: notify `{client_name ?? "there"}`, mention grace ends `{grace_ends_at}`, contact email for cancellation
4. Respond to webhook

### B6 — Main AI Audit Engine ⭐

**Trigger**: TWO Webhook nodes feeding into a Merge node. Both receive `AuditEnginePayload`.
- `N8N_RUN_AUDIT_WEBHOOK_URL` — initial run
- `N8N_RERUN_WEBHOOK_URL` — rebuild (has `previous_audit_id != null` and `review_notes != null`)

**Nodes** (high level — implementation detail in n8n's UI):

1. **Webhook(s) → Merge**
2. **Verify signature**
3. **Consent gate** — Code node. Fetch `discovery_calls` row via Supabase REST: `?audit_id=eq.{audit_id}`. If `recording_consent_captured = false`, jump to failure branch: callback `/api/webhooks/audit-complete` with `{status: 'failed', audit_id, error_text: 'consent_not_captured', categories: [], total_opportunity_gbp: 0, ...}` then stop.
4. **Transcript fetch** — Supabase Storage download `{transcript_path}` as text. Skip if null.
5. **Website scrape** — HTTP Request `{website_url}` if not null, extract visible text via n8n HTML node. Limit to 8000 chars.
6. **Context assembly** — Code node. Build CONTEXT string per Master Prompt Spec format:
```
   <BUSINESS_SUMMARY>{client_meta}</BUSINESS_SUMMARY>
   <SECTOR>{client_meta.sector}</SECTOR>
   <INTERNAL_FORM>{discovery_call}</INTERNAL_FORM>
   <CLIENT_QUESTIONNAIRE>{questionnaire}</CLIENT_QUESTIONNAIRE>
   <TRANSCRIPT>{transcript text}</TRANSCRIPT>
   <WEBSITE_TEXT>{scraped text}</WEBSITE_TEXT>
   {if rebuild:}
     <REVIEW_NOTES>{review_notes}</REVIEW_NOTES>
     <CLIENT_FOLLOWUPS>{client_followups text-joined}</CLIENT_FOLLOWUPS>
```
7. **Six parallel AI nodes** — one per category (1–6). Each:
   - Model: `claude-sonnet-4-5` (or `claude-opus-4-5` if high tier audit)
   - System prompt: shared block from Master Prompt Spec + that category's specific block
   - User: the CONTEXT string from step 6
   - Response format: JSON (matching schema in §11)
   - Capture `latency_ms`
8. **Wait + Collect** — wait for all 6, assemble into array
9. **Aggregate** — Code node:
   - `total_opportunity_gbp = sum(c.gbp_impact_annual)`
   - `audit_size_score` per §12 formula
   - `opportunity_tier` from `total_opportunity_gbp` per §12
   - `audit_size_tier` from `audit_size_score`
   - `final_tier = min(opportunity_tier, audit_size_tier)` (tier ordering: unqualified < small < mid < larger < serious)
   - `flagged_for_review = any(c.insufficient_data) || total_opp < 5000 || size_score < 15`
   - `flag_reasons = [reason strings if flagged]`
   - `executive_summary` — 1–2 paragraph narrative (separate AI call or assembled from top 3 categories)
10. **PDF builder** — HTML template → PDF (use n8n HTML→PDF library). Style per `app_settings`. Upload to `pdfs/{client_id}/{audit_id}/audit.pdf`.
11. **Callback** — HTTP POST `{callback_url}` (from payload) with `AuditCompletePayload`. HMAC-sign body. Body must include `audit_id` so the receiver knows which row to update.
12. **Respond to original webhook** with `{ok: true}` (callback is async — don't make caller wait).

**Error handling**: any node failure or AI call timeout → catch and callback `/api/webhooks/audit-complete` with `{status: 'failed', error_text: '...', audit_id, ...minimal payload}`.

---

## 11. AI Audit Engine — Prompt Spec

Source of truth: `CW_Master_Prompt_Spec_v1_060626.docx` (in project knowledge). Also relevant: `CW_6_Cat_Audit_Question_Bank_v1_050526.docx`.

Structure: shared system prompt + 6 per-category prompt blocks. Each category prompt includes:
- Role description (e.g. "You are the Lead Capture analyst…")
- 8–12 deep questions to assess
- JSON output schema
- GBP impact formula specific to that category
- RAG thresholds (score 0–35 = red, 36–69 = amber, 70–100 = green)

### The 6 categories

| # | Name | Focus |
|---|---|---|
| 1 | Lead Capture | Getting leads into the system reliably |
| 2 | Communication & Response | Speed and quality of replies |
| 3 | Booking & Conversion | Turning enquiries into appointments |
| 4 | Sales Process | Booking → revenue (price, upsell, follow-up) |
| 5 | Retention & Repeat | Recapturing customers post-sale |
| 6 | Operations & Admin | Internal efficiency, tools, owner time |

### Required per-category JSON output

```json
{
  "category_number": 1,
  "score": 73,
  "rag": "amber",
  "gbp_impact_annual": 24000,
  "insufficient_data": false,
  "missing_questions": [],
  "evidence": "string — what the agent observed in the inputs",
  "solution": "string — concrete recommendation",
  "report_section": "string — full markdown section for the PDF"
}
```

**When `insufficient_data: true`**, populate `missing_questions` with 1–4 specific questions from that category's deep-questions list that the agent needs answered to make a confident assessment. These flow through the dashboard's "N questions needed" badge → Email Follow-up modal → client's followup form.

### B7 — Master Prompt Spec edit

The shared system prompt in `CW_Master_Prompt_Spec_v1_060626.docx` (Section 5: "Output JSON Schema") needs the `missing_questions` field added to the schema and a paragraph explaining: when returning `insufficient_data: true`, the agent must populate `missing_questions` with 1–4 questions from its deep-questions list — these are the questions whose answers would unblock a confident assessment.

---

## 12. Audit Size & Tier Scoring

Source: `Audit___Internal_Tiers.pdf`.

### Opportunity Tier (from `total_opportunity_gbp`)

| Tier | Threshold |
|---|---|
| serious | ≥ £200,000 |
| larger | ≥ £100,000 |
| mid | ≥ £50,000 |
| small | ≥ £20,000 |
| unqualified | < £20,000 |

### Audit Size Score (0–100)

Built from input richness. Weighted sum:
- Transcript word count (0–25 pts): 0–500 words = 0, 500–2000 = up to 15, 2000+ = 25
- Questionnaire completeness (0–30 pts): % of *required* questionnaire fields answered with non-empty substantive answers × 30
- Discovery call completeness (0–20 pts): % of `discovery_calls` numeric fields populated × 20
- Website text quality (0–15 pts): 0 if no URL; 0–500 chars = 5; 500–3000 = 10; 3000+ = 15
- Client follow-ups (0–10 pts): 0 if none; first follow-up = 6; each additional = +2 (cap 10)

### Audit Size Tier (from `audit_size_score`)

| Tier | Range |
|---|---|
| serious | 85–100 |
| larger | 60–84 |
| mid | 25–59 |
| small | 0–24 |

### Final Tier

```
final_tier = min(opportunity_tier, audit_size_tier)
```

Tier ordering (low to high): `unqualified < small < mid < larger < serious`

This prevents claiming a "serious" opportunity from thin inputs.

**Staff override**: setting `audits.tier_overridden = true` allows manual edit of `final_tier`. Audit engine respects this on rebuild.

---

## 13. PDF Builder

- White-label using `app_settings` rows: `brand_name`, `brand_color`, `logo_url`
- Layout:
  1. Cover page (logo, business_name, sector, date, audit_id)
  2. Executive summary (1–2 paragraphs)
  3. Tier badge + total opportunity figure (£X annual)
  4. Per-category sections × 6 (score gauge, RAG colour, £ impact, evidence, solution, full report_section markdown)
  5. Methodology footnote
- Page numbers
- Footer: audit ID + generated-on date + "Confidential — for {business_name} only"
- Built in n8n (workflow B6, node 10)
- Stored at `pdfs/{client_id}/{audit_id}/audit.pdf`
- Signed URLs (30-day) created at send time in workflow B3

---

## 14. Environment Variables Registry

### App (Vercel + local)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# App
NEXT_PUBLIC_APP_URL

# Auth + rate limit + cron
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
CRON_SECRET

# n8n outbound
N8N_RUN_AUDIT_WEBHOOK_URL
N8N_RERUN_WEBHOOK_URL
N8N_SEND_AUDIT_WEBHOOK_URL
N8N_SEND_QUESTIONNAIRE_WEBHOOK_URL
N8N_EMAIL_FOLLOWUP_WEBHOOK_URL
N8N_DELETION_CONFIRMATION_WEBHOOK_URL
N8N_REGENERATE_PDF_WEBHOOK_URL    # exported but unused — PDF regen feature skipped

# n8n auth (shared)
N8N_WEBHOOK_SECRET
```

### Removed in A4

`RESEND_API_KEY` — Resend was deleted entirely.

### n8n side (configured in n8n instance)

- Same `N8N_WEBHOOK_SECRET`
- Supabase URL + service-role key (for the internal-form workflow's storage uploads + REST PATCHes)
- Anthropic API key (or AWS Bedrock credentials)
- SMTP credentials for outbound email
- `APP_URL` (matches `NEXT_PUBLIC_APP_URL`)

---

## 15. Decision Log

| # | Decision | Why |
|---|---|---|
| 1 | Standardised on Master Prompt Spec field keys | Single source of truth across DB, prompts, n8n forms |
| 2 | Internal form stays in n8n (not the dashboard) | User preference; n8n's form builder handles file uploads cleanly |
| 3 | Rebuild archives old + keeps latest 3 versions | User decision — history without clutter |
| 4 | All client emails through n8n; Resend removed | Single email path, no in-app SMTP dependency |
| 5 | `review_notes` (admin-only) vs `client_followups` (history) separated | Different actors, different lifecycles, different append semantics |
| 6 | `unchased_leads_per_month` chosen over spec's longer `quotes_or_leads_not_followed_up_per_month` | Pragmatic — n8n form already used short form, less awkward in code |
| 7 | PDF regeneration logic explicitly skipped | Out of scope; rebuild creates a fresh PDF |
| 8 | Magic links via Supabase `auth.admin.generateLink` | Reuses existing auth — no separate `magic_tokens` table needed |
| 9 | Sub-agent telemetry on `audit_categories` rows directly | 1:1 ratio, no separate `subagent_runs` table |
| 10 | Status `awaiting_client_followup` + `followup_received` separate states | Dashboard needs to show what's stuck waiting on client vs ready for review |

---

## 16. Quick Reference

### HMAC signing snippet

```ts
import crypto from 'crypto';
const signature = `sha256=${crypto.createHmac('sha256', N8N_WEBHOOK_SECRET).update(rawBody).digest('hex')}`;
// Set request header: X-Clearway-Signature
```

### Common Supabase queries

```ts
// Current audit for a client
service.from('audits').select('*').eq('client_id', X).eq('is_current', true).maybeSingle()

// Latest 3 versions for a client
service.from('audits').select('*').eq('client_id', X).is('deleted_at', null)
  .order('created_at', { ascending: false }).limit(3)

// All flagged categories on an audit
service.from('audit_categories').select('*').eq('audit_id', X)
  .eq('insufficient_data', true).not('missing_questions', 'is', null)

// Discovery call for an audit
service.from('discovery_calls').select('*').eq('audit_id', X).maybeSingle()

// Followups history for an audit
service.from('client_followups').select('*').eq('audit_id', X)
  .order('submitted_at', { ascending: true })
```

### Magic link generation

```ts
// lib/n8n.ts → generateMagicLink(service, email, nextPath)
const link = await generateMagicLink(service, "client@example.com", `/portal/followup/${audit_id}`);
// link: https://app.clearwayai.com/auth/callback?token_hash=...&type=magiclink&next=...
```

### File layout (app)

```
clearway-app/
├── app/
│   ├── (public)/login/
│   ├── auth/callback/route.ts
│   ├── (internal)/
│   │   ├── dashboard/, clients/, audits/, settings/, reviews/
│   ├── (client)/
│   │   └── portal/
│   │       ├── page.tsx
│   │       ├── questionnaire/[audit_id]/
│   │       └── followup/[audit_id]/        ← A5
│   └── api/
│       ├── clients/, audits/, questionnaires/
│       ├── followups/[audit_id]/submit/    ← A4
│       ├── n8n/discovery-call/             ← A4
│       └── webhooks/audit-complete/
├── lib/
│   ├── supabase/{server,browser}.ts
│   ├── n8n.ts          (AuditEnginePayload + 6 firers + generateMagicLink + buildAuditEnginePayload)
│   ├── rate-limit.ts
│   ├── constants/categories.ts (CATEGORIES, SCORE_TO_RAG, RAG_COLORS, SUGGEST_TIER)
│   └── types.ts
├── components/ui/ (button, badge, dialog, textarea, input, etc.)
├── middleware.ts
└── supabase/migrations/
    ├── 001…008
    ├── 005_prep_for_n8n
    ├── 010_phase_a1_schema_additions
    └── 011_phase_a2_field_key_standardization
```

### Repo-relative reference docs (in project knowledge)

- `CW_Master_Prompt_Spec_v1_060626.docx` — the 6 sub-agent prompts (source of truth for B6)
- `CW_6_Cat_Audit_Question_Bank_v1_050526.docx` — deep questions per category
- `CW_Zeesh_Funnel_x_Audit__updated_refs_.docx` — funnel + tier context
- `Audit___Internal_Tiers.pdf` — tier thresholds
- `Clearway_AI_Audit_Build_Doc.docx` — original requirements (some sections superseded by this doc)

---

## How to use this document in a new chat

1. Open a new Claude session
2. Make sure project knowledge contains: this file (`MASTER_BUILD_PLAN.md`) + the four reference docs above + the source repo
3. Open with: *"Read MASTER_BUILD_PLAN.md and tell me what phase we're on. I want to continue with [Phase X]."*
4. Claude will know the schema, the field keys, the API routes, the webhook contracts, and what's done vs remaining.

For the next phase (whichever you pick from §9 "Remaining"), ask Claude to produce a Claude Code prompt the way the previous phases were structured: explicit file lists, exact code snippets, type-check + diff at the end.

---
End of Master Build Plan v1.0
