-- ============================================================
-- Migration 006: Fix "permission denied for table users" in RLS
-- Apply in Supabase SQL editor: https://supabase.com/dashboard/project/gogtmnwnjyvpgbpcerjj/sql
-- (Already applied to the live project on 2026-06-27.)
-- ============================================================
--
-- The client-scoped policies below read auth.users directly via a scalar
-- subquery: (SELECT au.email FROM auth.users au WHERE au.id = auth.uid()).
-- The `authenticated` role has no SELECT grant on auth.users, and Postgres
-- evaluates that subquery as an InitPlan (before OR short-circuiting across
-- permissive policies), so EVERY query against these tables by an authenticated
-- user — including staff/admin — errored out and returned no rows. This is what
-- made the Clients list render empty.
--
-- Fix: read the caller's email from the JWT claims via auth.jwt() ->> 'email',
-- which needs no table access and preserves identical semantics.

-- clients
DROP POLICY IF EXISTS clients_client_select_own ON public.clients;
CREATE POLICY clients_client_select_own ON public.clients
  FOR SELECT USING (
    get_current_user_role() = 'client'
    AND lower(email) = lower(auth.jwt() ->> 'email')
  );

-- audits
DROP POLICY IF EXISTS audits_client_select_sent ON public.audits;
CREATE POLICY audits_client_select_sent ON public.audits
  FOR SELECT USING (
    get_current_user_role() = 'client'
    AND status = 'sent'
    AND client_id IN (
      SELECT c.id FROM clients c
      WHERE lower(c.email) = lower(auth.jwt() ->> 'email')
    )
  );

-- audit_categories
DROP POLICY IF EXISTS audit_categories_client_select_own ON public.audit_categories;
CREATE POLICY audit_categories_client_select_own ON public.audit_categories
  FOR SELECT USING (
    get_current_user_role() = 'client'
    AND audit_id IN (
      SELECT a.id FROM audits a JOIN clients c ON c.id = a.client_id
      WHERE a.status = 'sent'
        AND lower(c.email) = lower(auth.jwt() ->> 'email')
    )
  );

-- questionnaires
DROP POLICY IF EXISTS questionnaires_client_select_own ON public.questionnaires;
CREATE POLICY questionnaires_client_select_own ON public.questionnaires
  FOR SELECT USING (
    get_current_user_role() = 'client'
    AND audit_id IN (
      SELECT a.id FROM audits a JOIN clients c ON c.id = a.client_id
      WHERE lower(c.email) = lower(auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS questionnaires_client_insert_own ON public.questionnaires;
CREATE POLICY questionnaires_client_insert_own ON public.questionnaires
  FOR INSERT WITH CHECK (
    get_current_user_role() = 'client'
    AND audit_id IN (
      SELECT a.id FROM audits a JOIN clients c ON c.id = a.client_id
      WHERE lower(c.email) = lower(auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS questionnaires_client_update_own ON public.questionnaires;
CREATE POLICY questionnaires_client_update_own ON public.questionnaires
  FOR UPDATE USING (
    get_current_user_role() = 'client'
    AND audit_id IN (
      SELECT a.id FROM audits a JOIN clients c ON c.id = a.client_id
      WHERE lower(c.email) = lower(auth.jwt() ->> 'email')
    )
  );

-- client_followups (preserves original exact email comparison, no lower())
DROP POLICY IF EXISTS "Client reads own followups" ON public.client_followups;
CREATE POLICY "Client reads own followups" ON public.client_followups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM audits a JOIN clients c ON c.id = a.client_id
      WHERE a.id = client_followups.audit_id
        AND c.email = (auth.jwt() ->> 'email')
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Client inserts own followup" ON public.client_followups;
CREATE POLICY "Client inserts own followup" ON public.client_followups
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM audits a JOIN clients c ON c.id = a.client_id
      WHERE a.id = client_followups.audit_id
        AND c.email = (auth.jwt() ->> 'email')
        AND c.deleted_at IS NULL
    )
  );
