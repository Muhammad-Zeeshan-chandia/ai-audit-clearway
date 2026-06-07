-- ============================================================
-- Migration 005: Prep for n8n integration
-- Apply in Supabase SQL editor: https://supabase.com/dashboard/project/gogtmnwnjyvpgbpcerjj/sql
-- ============================================================

-- 1. Add sites_count to questionnaire field_definitions (missing from seed)
INSERT INTO public.field_definitions
  (entity, field_key, label, field_type, required, display_order, active)
VALUES
  ('questionnaire', 'sites_count', 'Number of sites / locations', 'number', false, 165, true)
ON CONFLICT (entity, field_key) DO NOTHING;

-- 2. Add audit_size_score (n8n returns this, used to suggest tier)
ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS audit_size_score numeric;

-- 3. Add executive_summary (n8n returns this, shown on audit detail + PDF)
ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS executive_summary text;

-- 4. Add tier_overridden so we can track when staff overrode n8n's tier suggestion
ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS tier_overridden boolean NOT NULL DEFAULT false;

-- 5. Create wide pivot view for the audits list page
--    Queries this like: SELECT * FROM v_audits_wide WHERE ...
--    No RLS needed — inherits from base tables; only staff/admin reach this via the app.
CREATE OR REPLACE VIEW public.v_audits_wide AS
SELECT
  a.id                              AS audit_id,
  a.client_id,
  a.status,
  a.created_at,
  a.questionnaire_submitted_at,
  a.audit_run_at,
  a.total_opportunity_gbp,
  a.audit_size_score,
  a.final_tier,
  a.tier_overridden,
  a.flagged_for_review,
  a.flag_reasons,
  a.reviewed_by,
  a.review_notes,
  a.sent_at,
  a.pdf_path,
  a.transcript_path,
  c.business_name,
  c.owner_name,
  c.email                           AS client_email,
  c.phone,
  c.sector,
  c.call_date,
  c.consent_captured,
  c.website_url,
  c.shay_notes,
  q.data                            AS questionnaire,
  MAX(CASE WHEN ac.category_number = 1 THEN ac.score            END) AS c1_score,
  MAX(CASE WHEN ac.category_number = 1 THEN ac.gbp_impact_annual END) AS c1_gbp,
  MAX(CASE WHEN ac.category_number = 2 THEN ac.score            END) AS c2_score,
  MAX(CASE WHEN ac.category_number = 2 THEN ac.gbp_impact_annual END) AS c2_gbp,
  MAX(CASE WHEN ac.category_number = 3 THEN ac.score            END) AS c3_score,
  MAX(CASE WHEN ac.category_number = 3 THEN ac.gbp_impact_annual END) AS c3_gbp,
  MAX(CASE WHEN ac.category_number = 4 THEN ac.score            END) AS c4_score,
  MAX(CASE WHEN ac.category_number = 4 THEN ac.gbp_impact_annual END) AS c4_gbp,
  MAX(CASE WHEN ac.category_number = 5 THEN ac.score            END) AS c5_score,
  MAX(CASE WHEN ac.category_number = 5 THEN ac.gbp_impact_annual END) AS c5_gbp,
  MAX(CASE WHEN ac.category_number = 6 THEN ac.score            END) AS c6_score,
  MAX(CASE WHEN ac.category_number = 6 THEN ac.gbp_impact_annual END) AS c6_gbp
FROM public.audits a
JOIN public.clients c ON c.id = a.client_id AND c.deleted_at IS NULL
LEFT JOIN public.questionnaires q ON q.audit_id = a.id
LEFT JOIN public.audit_categories ac ON ac.audit_id = a.id
WHERE a.deleted_at IS NULL
GROUP BY a.id, c.id, q.id;
