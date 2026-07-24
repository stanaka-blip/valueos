-- Fix: case_settlements RLS blocks anon/authenticated inserts
-- ("new row violates row-level security policy")
-- Align with existing ValueOS tables that are used via the publishable key:
-- disable RLS and ensure grants. Also add open policies as a safety net
-- if RLS is re-enabled later without app-level auth.

ALTER TABLE public.case_settlements DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS case_settlements_anon_all ON public.case_settlements;
DROP POLICY IF EXISTS case_settlements_authenticated_all ON public.case_settlements;

CREATE POLICY case_settlements_anon_all
  ON public.case_settlements
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY case_settlements_authenticated_all
  ON public.case_settlements
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_settlements TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_settlements TO service_role;
