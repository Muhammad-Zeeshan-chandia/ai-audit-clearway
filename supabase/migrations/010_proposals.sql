-- ============================================================
-- Migration 010: Proposals
-- Apply in Supabase SQL editor: https://supabase.com/dashboard/project/gogtmnwnjyvpgbpcerjj/sql
-- ============================================================
--
-- Adds a per-audit proposal generated from the finished audit. One proposal
-- row per audit (UNIQUE audit_id); regeneration updates the row in place. The
-- proposal PDF is built by a separate n8n workflow which uploads to the `pdfs`
-- bucket and calls /api/webhooks/proposal-ready.

CREATE TABLE IF NOT EXISTS public.proposals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id           uuid NOT NULL UNIQUE REFERENCES public.audits(id) ON DELETE CASCADE,
  client_id          uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'generating'
                       CHECK (status IN ('generating','ready','sending','sent','failed')),
  pdf_path           text,
  pdf_generated_at   timestamptz,
  instructions       text,                 -- latest regeneration notes
  regenerate_count   int  NOT NULL DEFAULT 0,
  sent_at            timestamptz,
  created_by         uuid REFERENCES public.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_audit_id  ON public.proposals(audit_id);
CREATE INDEX IF NOT EXISTS idx_proposals_client_id ON public.proposals(client_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status    ON public.proposals(status);

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proposals_staff_all ON public.proposals;
CREATE POLICY proposals_staff_all ON public.proposals
  FOR ALL USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin());

DROP TRIGGER IF EXISTS touch_proposals_updated_at ON public.proposals;
CREATE TRIGGER touch_proposals_updated_at BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime for the new table (guarded ADD TABLE, same pattern as 009)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='proposals'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.proposals';
  END IF;
END $$;
