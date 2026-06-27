-- ============================================================
-- Migration 008: Enable Realtime on app tables
-- Apply in Supabase SQL editor: https://supabase.com/dashboard/project/gogtmnwnjyvpgbpcerjj/sql
-- (Already applied to the live project on 2026-06-27.)
-- ============================================================
--
-- Adds the tables the internal app renders to the supabase_realtime
-- publication so the dashboard and list views auto-refresh on any change
-- (e.g. an n8n callback completing an audit) without a manual reload.
-- Idempotent — skips tables already in the publication.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audits','audit_categories','clients','notifications',
    'questionnaires','discovery_calls','client_followups'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
