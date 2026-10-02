-- READ ONLY / VERIFY ONLY
-- Apply after migration 20261002100000 on Production (human).
-- Do not run as a data-changing script.

-- 1) helper exists + DEFINER + search_path
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS is_security_definer,
  pg_get_function_result(p.oid) AS result_type,
  (
    SELECT array_agg(a.rolname ORDER BY a.rolname)
    FROM aclexplode(p.proacl) e
    JOIN pg_roles a ON a.oid = e.grantee
    WHERE e.privilege_type = 'EXECUTE'
  ) AS execute_grantees
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'case_has_locking_dealer_settlement';

SELECT pg_get_functiondef(p.oid) AS helper_def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'case_has_locking_dealer_settlement';

-- 2) replace_invoice uses helper (no FROM dealer_settlements)
SELECT pg_get_functiondef(p.oid) AS replace_invoice_def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'replace_invoice'
  AND pg_get_function_identity_arguments(p.oid) = 'payload jsonb';

-- 3) TABLE privileges on dealer_settlements must still exclude anon/authenticated
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'dealer_settlements'
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
ORDER BY grantee, privilege_type;

-- 4) authenticated cannot SELECT table directly (expect 42501)
-- Run manually in a transaction if desired:
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT 1 FROM public.dealer_settlements LIMIT 1;  -- expect permission denied
-- ROLLBACK;
