-- ============================================================
-- Migration 007: Per-audit access token for passwordless client links
-- Apply in Supabase SQL editor: https://supabase.com/dashboard/project/gogtmnwnjyvpgbpcerjj/sql
-- (Already applied to the live project on 2026-06-27.)
-- ============================================================
--
-- Clients no longer authenticate. Each audit carries an unguessable token
-- used in the email links:
--   /q/{access_token}  -> questionnaire
--   /f/{access_token}  -> follow-up
-- The token is the only credential; pages/APIs validate it with the service
-- role. This removes Supabase magic-link auth for clients completely.

ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS access_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_audits_access_token
  ON public.audits (access_token);
