-- =============================================================================
-- 2026-08-10 release batch — Production 適用前確認（SELECT のみ）
-- Base main: 7d895c9d8d1cb67a37a40d3b982f367c99066663
--
-- 対象:
--   20260810120000_create_product_bulk_setup_rpc.sql
--   20260810140000_invoice_line_items.sql
--   20260810150000_three_party_money_events.sql
--   20260810160000_three_party_money_request_ledger.sql
--   20260810161000_execute_three_party_money_rpc.sql
--
-- 禁止: INSERT/UPDATE/DELETE/TRUNCATE/DDL/RPC 業務呼び出し
-- 目的: 既適用/未適用・依存オブジェクト・権限競合・既存データ健全性の記録
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Migration 履歴（存在するテーブルのみ）
-- ---------------------------------------------------------------------------
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname IN ('supabase_migrations', 'public')
  AND c.relname IN ('schema_migrations', 'supabase_migrations')
ORDER BY 1, 2;

-- supabase CLI 標準（無い場合はこのクエリだけ手動スキップ）
SELECT version, name, inserted_at
FROM supabase_migrations.schema_migrations
WHERE version LIKE '20260810%'
   OR version IN (
     '20260808200000',
     '20260808220000',
     '20260808230000',
     '20260808190000',
     '20260808140000',
     '20260807120000'
   )
ORDER BY version;

-- ---------------------------------------------------------------------------
-- 1) 候補オブジェクトの存在（未適用ならすべて false が期待）
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
    AS has_execute_three_party_money,
  to_regprocedure('public.valueos_set_updated_at()') IS NOT NULL
    AS has_valueos_set_updated_at;

-- 部分適用検知（どれかだけ true なら STOP）
SELECT
  (
    SELECT count(*) FILTER (WHERE present)
    FROM (
      VALUES
        (to_regclass('public.product_bulk_setup_requests') IS NOT NULL),
        (to_regprocedure('public.create_product_bulk_setup(jsonb)') IS NOT NULL)
    ) AS t(present)
  ) AS product_bulk_present_count,
  (
    SELECT count(*) FILTER (WHERE present)
    FROM (
      VALUES
        (to_regclass('public.invoice_line_items') IS NOT NULL)
    ) AS t(present)
  ) AS invoice_lines_present_count,
  (
    SELECT count(*) FILTER (WHERE present)
    FROM (
      VALUES
        (to_regclass('public.finance_receipts') IS NOT NULL),
        (to_regclass('public.dealer_settlements') IS NOT NULL),
        (to_regclass('public.dealer_settlement_lines') IS NOT NULL),
        (to_regclass('public.supplier_payments') IS NOT NULL),
        (to_regclass('public.three_party_money_requests') IS NOT NULL),
        (to_regprocedure('public.execute_three_party_money(jsonb)') IS NOT NULL)
    ) AS t(present)
  ) AS three_party_present_count;

-- ---------------------------------------------------------------------------
-- 2) 依存テーブルの存在（必須。欠けると Migration 失敗）
-- ---------------------------------------------------------------------------
SELECT
  to_regclass('public.manufacturers') IS NOT NULL AS has_manufacturers,
  to_regclass('public.products') IS NOT NULL AS has_products,
  to_regclass('public.product_series') IS NOT NULL AS has_product_series,
  to_regclass('public.invoices') IS NOT NULL AS has_invoices,
  to_regclass('public.cases') IS NOT NULL AS has_cases,
  to_regclass('public.dealers') IS NOT NULL AS has_dealers,
  to_regclass('public.suppliers') IS NOT NULL AS has_suppliers,
  to_regclass('public.orders') IS NOT NULL AS has_orders;

-- ---------------------------------------------------------------------------
-- 3) 既存業務テーブル件数（適用前後で不変であること）
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

-- ---------------------------------------------------------------------------
-- 4) invoices 指紋（invoice_line_items 適用でも不変）
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5) products 指紋（product bulk RPC 適用でも不変）
-- ---------------------------------------------------------------------------
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
-- 6) 名前衝突チェック（同名だが想定外定義）
-- ---------------------------------------------------------------------------
-- invoice_line_items 列（存在する場合のみ行が出る）
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'invoice_line_items'
ORDER BY ordinal_position;

-- 3社間テーブル列サマリ（存在する場合）
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'finance_receipts',
    'dealer_settlements',
    'dealer_settlement_lines',
    'supplier_payments',
    'three_party_money_requests',
    'product_bulk_setup_requests'
  )
ORDER BY table_name, ordinal_position;

-- ---------------------------------------------------------------------------
-- 7) FK / 制約（候補テーブルが既にある場合）
-- ---------------------------------------------------------------------------
SELECT
  conrelid::regclass AS table_name,
  conname,
  contype,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid::regclass::text IN (
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
-- 8) RLS 状態
-- ---------------------------------------------------------------------------
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  (
    SELECT count(*)
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname
  ) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'invoice_line_items',
    'finance_receipts',
    'dealer_settlements',
    'dealer_settlement_lines',
    'supplier_payments',
    'three_party_money_requests',
    'product_bulk_setup_requests',
    'invoices'
  )
ORDER BY c.relname;

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'invoice_line_items',
    'finance_receipts',
    'dealer_settlements',
    'dealer_settlement_lines',
    'supplier_payments',
    'three_party_money_requests',
    'product_bulk_setup_requests',
    'invoices'
  )
ORDER BY tablename, policyname;

-- ---------------------------------------------------------------------------
-- 9) テーブル権限（anon / authenticated / service_role）
--    ★ 3社間: anon/authenticated に INSERT/UPDATE/DELETE が付いていないこと
--    ★ 3社間: service_role に DELETE が付いていないこと
-- ---------------------------------------------------------------------------
SELECT
  table_name,
  grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'invoice_line_items',
    'finance_receipts',
    'dealer_settlements',
    'dealer_settlement_lines',
    'supplier_payments',
    'three_party_money_requests',
    'product_bulk_setup_requests'
  )
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- 3社間の危険権限（適用後は 0 行が期待。未適用なら対象テーブルなしで 0 行）
SELECT
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'finance_receipts',
    'dealer_settlements',
    'dealer_settlement_lines',
    'supplier_payments',
    'three_party_money_requests'
  )
  AND (
    (grantee IN ('anon', 'authenticated', 'PUBLIC')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'))
    OR (grantee = 'service_role' AND privilege_type = 'DELETE')
  )
ORDER BY table_name, grantee, privilege_type;

-- ---------------------------------------------------------------------------
-- 10) RPC 実行権限
-- ---------------------------------------------------------------------------
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  r.rolname AS grantee,
  has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (
  SELECT oid, rolname FROM pg_roles
  WHERE rolname IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
) r
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_product_bulk_setup',
    'execute_three_party_money',
    'create_product_setup',
    'create_package_bulk_setup'
  )
ORDER BY function_name, grantee;

-- 危険: anon/authenticated が金額系 RPC を実行できる行（適用後 0 が期待）
SELECT
  p.proname AS function_name,
  r.rolname AS grantee
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (
  SELECT oid, rolname FROM pg_roles
  WHERE rolname IN ('anon', 'authenticated')
) r
WHERE n.nspname = 'public'
  AND p.proname = 'execute_three_party_money'
  AND has_function_privilege(r.oid, p.oid, 'EXECUTE');

-- ---------------------------------------------------------------------------
-- 11) product_bulk_setup_requests の status CHECK 定義衝突（部分作成時）
-- ---------------------------------------------------------------------------
SELECT
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname = 'product_bulk_setup_requests_status_check'
  AND conrelid = to_regclass('public.product_bulk_setup_requests');

-- ---------------------------------------------------------------------------
-- 12) 既存 invoices / payments 健全性（参照用・変更しない）
-- ---------------------------------------------------------------------------
SELECT
  count(*)::bigint AS invoice_count,
  count(*) FILTER (WHERE invoice_amount IS NULL)::bigint AS null_amount_count
FROM public.invoices;

SELECT
  count(*)::bigint AS payment_count
FROM public.payments;

-- ---------------------------------------------------------------------------
-- 13) 判定サマリ（人が読む用）
-- ---------------------------------------------------------------------------
SELECT
  CASE
    WHEN to_regclass('public.product_bulk_setup_requests') IS NULL
     AND to_regprocedure('public.create_product_bulk_setup(jsonb)') IS NULL
    THEN 'PENDING'
    WHEN to_regclass('public.product_bulk_setup_requests') IS NOT NULL
     AND to_regprocedure('public.create_product_bulk_setup(jsonb)') IS NOT NULL
    THEN 'APPLIED'
    ELSE 'PARTIAL_STOP'
  END AS mig_20260810120000_status,
  CASE
    WHEN to_regclass('public.invoice_line_items') IS NULL THEN 'PENDING'
    ELSE 'APPLIED_OR_PRESENT'
  END AS mig_20260810140000_status,
  CASE
    WHEN to_regclass('public.finance_receipts') IS NULL
     AND to_regclass('public.dealer_settlements') IS NULL
     AND to_regclass('public.dealer_settlement_lines') IS NULL
     AND to_regclass('public.supplier_payments') IS NULL
    THEN 'PENDING'
    WHEN to_regclass('public.finance_receipts') IS NOT NULL
     AND to_regclass('public.dealer_settlements') IS NOT NULL
     AND to_regclass('public.dealer_settlement_lines') IS NOT NULL
     AND to_regclass('public.supplier_payments') IS NOT NULL
    THEN 'APPLIED'
    ELSE 'PARTIAL_STOP'
  END AS mig_20260810150000_status,
  CASE
    WHEN to_regclass('public.three_party_money_requests') IS NULL THEN 'PENDING'
    ELSE 'APPLIED_OR_PRESENT'
  END AS mig_20260810160000_status,
  CASE
    WHEN to_regprocedure('public.execute_three_party_money(jsonb)') IS NULL
    THEN 'PENDING'
    ELSE 'APPLIED_OR_PRESENT'
  END AS mig_20260810161000_status,
  CASE
    WHEN to_regclass('public.manufacturers') IS NOT NULL
     AND to_regclass('public.products') IS NOT NULL
     AND to_regclass('public.invoices') IS NOT NULL
     AND to_regclass('public.cases') IS NOT NULL
     AND to_regclass('public.dealers') IS NOT NULL
     AND to_regclass('public.suppliers') IS NOT NULL
     AND to_regclass('public.orders') IS NOT NULL
    THEN 'DEPS_OK'
    ELSE 'DEPS_MISSING_STOP'
  END AS dependency_status;
