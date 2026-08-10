-- =============================================================================
-- 2026-08-10 release batch — Production 適用後確認（SELECT のみ）
-- Base main: 7d895c9d8d1cb67a37a40d3b982f367c99066663
--
-- PASS 条件（要約）:
--   - 候補テーブル/RPC がすべて存在
--   - 既存業務テーブル件数・fingerprint が precheck と一致
--   - 3社間テーブル: anon/authenticated に書込権限なし
--   - 3社間テーブル + ledger: service_role に DELETE なし
--   - execute_three_party_money / create_product_bulk_setup:
--       service_role EXECUTE 可、anon/authenticated EXECUTE 不可
--   - invoice_line_items は 0 行（既存 invoices を壊していない）
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) オブジェクト存在（すべて true）
-- ---------------------------------------------------------------------------
SELECT
  to_regclass('public.product_bulk_setup_requests') IS NOT NULL
    AS has_product_bulk_setup_requests,
  to_regprocedure('public.create_product_bulk_setup(jsonb)') IS NOT NULL
    AS has_create_product_bulk_setup,
  to_regclass('public.invoice_line_items') IS NOT NULL
    AS has_invoice_line_items,
  to_regclass('public.finance_receipts') IS NOT NULL
    AS has_finance_receipts,
  to_regclass('public.dealer_settlements') IS NOT NULL
    AS has_dealer_settlements,
  to_regclass('public.dealer_settlement_lines') IS NOT NULL
    AS has_dealer_settlement_lines,
  to_regclass('public.supplier_payments') IS NOT NULL
    AS has_supplier_payments,
  to_regclass('public.three_party_money_requests') IS NOT NULL
    AS has_three_party_money_requests,
  to_regprocedure('public.execute_three_party_money(jsonb)') IS NOT NULL
    AS has_execute_three_party_money;

-- Migration 履歴
SELECT version, name, inserted_at
FROM supabase_migrations.schema_migrations
WHERE version LIKE '20260810%'
ORDER BY version;

-- ---------------------------------------------------------------------------
-- 2) 既存業務件数（precheck と一致必須）
-- ---------------------------------------------------------------------------
SELECT 'manufacturers' AS table_name, count(*)::bigint AS row_count FROM public.manufacturers
UNION ALL SELECT 'products', count(*)::bigint FROM public.products
UNION ALL SELECT 'product_series', count(*)::bigint FROM public.product_series
UNION ALL SELECT 'packages', count(*)::bigint FROM public.packages
UNION ALL SELECT 'cases', count(*)::bigint FROM public.cases
UNION ALL SELECT 'case_products', count(*)::bigint FROM public.case_products
UNION ALL SELECT 'case_packages', count(*)::bigint FROM public.case_packages
UNION ALL SELECT 'invoices', count(*)::bigint FROM public.invoices
UNION ALL SELECT 'payments', count(*)::bigint FROM public.payments
UNION ALL SELECT 'orders', count(*)::bigint FROM public.orders
UNION ALL SELECT 'dealers', count(*)::bigint FROM public.dealers
UNION ALL SELECT 'suppliers', count(*)::bigint FROM public.suppliers
UNION ALL SELECT 'case_settlements', count(*)::bigint FROM public.case_settlements
ORDER BY table_name;

SELECT
  count(*)::bigint AS invoice_row_count,
  md5(string_agg(row_fp, '' ORDER BY row_fp)) AS invoices_fingerprint
FROM (
  SELECT md5(concat_ws('|',
    id::text,
    coalesce(case_id::text, ''),
    coalesce(invoice_no, ''),
    coalesce(invoice_amount::text, ''),
    coalesce(memo, '')
  )) AS row_fp
  FROM public.invoices
) s;

SELECT
  count(*)::bigint AS product_row_count,
  md5(string_agg(row_fp, '' ORDER BY row_fp)) AS products_fingerprint
FROM (
  SELECT md5(concat_ws('|',
    id::text,
    coalesce(manufacturer_id::text, ''),
    coalesce(series_id::text, ''),
    coalesce(model_no, ''),
    coalesce(name, ''),
    coalesce(category, ''),
    coalesce(is_active::text, '')
  )) AS row_fp
  FROM public.products
) s;

-- ---------------------------------------------------------------------------
-- 3) 新規テーブル件数（初期はすべて 0）
-- ---------------------------------------------------------------------------
SELECT 'invoice_line_items' AS table_name, count(*)::bigint AS row_count
FROM public.invoice_line_items
UNION ALL SELECT 'product_bulk_setup_requests', count(*)::bigint
FROM public.product_bulk_setup_requests
UNION ALL SELECT 'finance_receipts', count(*)::bigint FROM public.finance_receipts
UNION ALL SELECT 'dealer_settlements', count(*)::bigint FROM public.dealer_settlements
UNION ALL SELECT 'dealer_settlement_lines', count(*)::bigint
FROM public.dealer_settlement_lines
UNION ALL SELECT 'supplier_payments', count(*)::bigint FROM public.supplier_payments
UNION ALL SELECT 'three_party_money_requests', count(*)::bigint
FROM public.three_party_money_requests
ORDER BY table_name;

-- ---------------------------------------------------------------------------
-- 4) invoice_line_items スキーマ
-- ---------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'invoice_line_items'
ORDER BY ordinal_position;

SELECT
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.invoice_line_items'::regclass
ORDER BY conname;

-- RLS + policies（invoices と同系統の client CRUD を許可する設計）
SELECT c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'invoice_line_items';

SELECT policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'invoice_line_items'
ORDER BY policyname;

-- ---------------------------------------------------------------------------
-- 5) 3社間 RLS / grants（最重要）
-- ---------------------------------------------------------------------------
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  (
    SELECT count(*) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname
  ) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'finance_receipts',
    'dealer_settlements',
    'dealer_settlement_lines',
    'supplier_payments',
    'three_party_money_requests',
    'product_bulk_setup_requests'
  )
ORDER BY c.relname;

-- 期待:
--   finance_* / dealer_* / supplier_payments: RLS ON, policy_count = 0
--   three_party_money_requests / product_bulk_setup_requests: RLS OFF

SELECT
  table_name,
  grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'finance_receipts',
    'dealer_settlements',
    'dealer_settlement_lines',
    'supplier_payments',
    'three_party_money_requests',
    'product_bulk_setup_requests',
    'invoice_line_items'
  )
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- FAIL if any rows:
--   anon/authenticated の INSERT/UPDATE/DELETE on 3社間+ledger
--   service_role DELETE on 3社間+ledger
SELECT
  table_name,
  grantee,
  privilege_type,
  'UNEXPECTED_PRIVILEGE' AS verdict
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'finance_receipts',
    'dealer_settlements',
    'dealer_settlement_lines',
    'supplier_payments',
    'three_party_money_requests',
    'product_bulk_setup_requests'
  )
  AND (
    (grantee IN ('anon', 'authenticated', 'PUBLIC')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'SELECT'))
    OR (grantee = 'service_role' AND privilege_type = 'DELETE')
  )
ORDER BY table_name, grantee, privilege_type;

-- service_role 必須権限（各テーブル SELECT,INSERT,UPDATE）
SELECT
  t.table_name,
  bool_and(g.privilege_type = 'SELECT') FILTER (WHERE g.privilege_type = 'SELECT')
    IS TRUE AS has_select,
  bool_and(g.privilege_type = 'INSERT') FILTER (WHERE g.privilege_type = 'INSERT')
    IS TRUE AS has_insert,
  bool_and(g.privilege_type = 'UPDATE') FILTER (WHERE g.privilege_type = 'UPDATE')
    IS TRUE AS has_update,
  bool_or(g.privilege_type = 'DELETE') AS has_delete
FROM (
  VALUES
    ('finance_receipts'),
    ('dealer_settlements'),
    ('dealer_settlement_lines'),
    ('supplier_payments'),
    ('three_party_money_requests'),
    ('product_bulk_setup_requests')
) AS t(table_name)
LEFT JOIN information_schema.role_table_grants g
  ON g.table_schema = 'public'
 AND g.table_name = t.table_name
 AND g.grantee = 'service_role'
GROUP BY t.table_name
ORDER BY t.table_name;

-- ---------------------------------------------------------------------------
-- 6) RPC grants
-- ---------------------------------------------------------------------------
SELECT
  p.proname AS function_name,
  r.rolname AS grantee,
  has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (
  SELECT oid, rolname FROM pg_roles
  WHERE rolname IN ('anon', 'authenticated', 'service_role')
) r
WHERE n.nspname = 'public'
  AND p.proname IN ('create_product_bulk_setup', 'execute_three_party_money')
ORDER BY function_name, grantee;

-- FAIL rows（anon/authenticated EXECUTE）
SELECT
  p.proname AS function_name,
  r.rolname AS grantee,
  'UNEXPECTED_EXECUTE' AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (
  SELECT oid, rolname FROM pg_roles
  WHERE rolname IN ('anon', 'authenticated')
) r
WHERE n.nspname = 'public'
  AND p.proname IN ('create_product_bulk_setup', 'execute_three_party_money')
  AND has_function_privilege(r.oid, p.oid, 'EXECUTE');

-- service_role EXECUTE must be true
SELECT
  p.proname AS function_name,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('create_product_bulk_setup', 'execute_three_party_money');

-- ---------------------------------------------------------------------------
-- 7) FK 削除挙動（定義確認）
-- ---------------------------------------------------------------------------
SELECT
  conrelid::regclass AS table_name,
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid::regclass::text IN (
    'public.invoice_line_items',
    'public.finance_receipts',
    'public.dealer_settlements',
    'public.dealer_settlement_lines',
    'public.supplier_payments',
    'public.three_party_money_requests',
    'public.product_bulk_setup_requests'
  )
ORDER BY 1, 2;

-- ---------------------------------------------------------------------------
-- 8) PASS/FAIL サマリ
-- ---------------------------------------------------------------------------
SELECT
  (
    to_regclass('public.product_bulk_setup_requests') IS NOT NULL
    AND to_regprocedure('public.create_product_bulk_setup(jsonb)') IS NOT NULL
    AND to_regclass('public.invoice_line_items') IS NOT NULL
    AND to_regclass('public.finance_receipts') IS NOT NULL
    AND to_regclass('public.dealer_settlements') IS NOT NULL
    AND to_regclass('public.dealer_settlement_lines') IS NOT NULL
    AND to_regclass('public.supplier_payments') IS NOT NULL
    AND to_regclass('public.three_party_money_requests') IS NOT NULL
    AND to_regprocedure('public.execute_three_party_money(jsonb)') IS NOT NULL
  ) AS all_objects_present,
  (
    SELECT count(*) = 0
    FROM public.invoice_line_items
  ) AS invoice_line_items_empty_ok,
  (
    NOT has_function_privilege('anon', 'public.execute_three_party_money(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.execute_three_party_money(jsonb)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.execute_three_party_money(jsonb)', 'EXECUTE')
  ) AS three_party_rpc_grants_ok,
  (
    NOT has_function_privilege('anon', 'public.create_product_bulk_setup(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.create_product_bulk_setup(jsonb)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.create_product_bulk_setup(jsonb)', 'EXECUTE')
  ) AS product_bulk_rpc_grants_ok,
  (
    SELECT count(*) = 0
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN (
        'finance_receipts',
        'dealer_settlements',
        'dealer_settlement_lines',
        'supplier_payments',
        'three_party_money_requests',
        'product_bulk_setup_requests'
      )
      AND (
        (grantee IN ('anon', 'authenticated', 'PUBLIC')
          AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'SELECT'))
        OR (grantee = 'service_role' AND privilege_type = 'DELETE')
      )
  ) AS three_party_table_grants_ok;
