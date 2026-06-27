-- ============================================================
-- Migration 009: Two-run audit model
-- Apply in Supabase SQL editor: https://supabase.com/dashboard/project/gogtmnwnjyvpgbpcerjj/sql
-- (Already applied to the live project on 2026-06-27.)
-- ============================================================
--
-- Splits the audit into an INITIAL run (produces follow-up questions, no PDF)
-- and a manual FINAL run (full context incl. the client's answers, no PDF).
-- PDF generation becomes a separate workflow. Adds the lifecycle states and a
-- table for the client's per-question answers.

-- 1. run_stage on audits (which run produced the current result)
ALTER TABLE public.audits ADD COLUMN IF NOT EXISTS run_stage text NOT NULL DEFAULT 'initial';
ALTER TABLE public.audits DROP CONSTRAINT IF EXISTS audits_run_stage_check;
ALTER TABLE public.audits ADD CONSTRAINT audits_run_stage_check CHECK (run_stage IN ('initial','final'));

-- 2. PDF-ready timestamp (set by the dedicated pdf-ready callback)
ALTER TABLE public.audits ADD COLUMN IF NOT EXISTS pdf_generated_at timestamptz;

-- 3. Expanded status lifecycle
ALTER TABLE public.audits DROP CONSTRAINT IF EXISTS audits_status_check;
ALTER TABLE public.audits ADD CONSTRAINT audits_status_check CHECK (status IN (
  'awaiting_questionnaire','audit_running','awaiting_review',
  'awaiting_client_followup','followup_received',
  'awaiting_answers','answers_received','final_review',
  'approved','sent','failed','archived'
));

-- 4. Per-question follow-up answers (one row per question the client answers)
CREATE TABLE IF NOT EXISTS public.followup_answers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id        uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  category_number int,
  question_text   text NOT NULL,
  answer_text     text NOT NULL,
  submitted_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_followup_answers_audit_id ON public.followup_answers(audit_id);

ALTER TABLE public.followup_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS followup_answers_staff_all ON public.followup_answers;
CREATE POLICY followup_answers_staff_all ON public.followup_answers
  FOR ALL USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin());

-- 5. Realtime for the new table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='followup_answers'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.followup_answers';
  END IF;
END $$;
