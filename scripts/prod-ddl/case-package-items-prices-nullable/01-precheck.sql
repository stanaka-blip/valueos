-- =============================================================================
-- case_package_items 価格2列 NULL 許容 hotfix — 適用前確認（SELECT のみ）
-- Migration: 20260801120000_case_package_items_prices_nullable.sql
-- =============================================================================
-- 保存して適用後と比較すること:
--   - 件数 (B)
--   - fingerprint (C)
--   - nullability (A)
-- ※ このスクリプトは業務データを変更しない / RPC を呼ばない
-- =============================================================================

-- A) 対象列の型・DEFAULT・nullability
SELECT
  column_name,
  data_type,
  udt_name,
  numeric_precision,
  numeric_scale,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'case_package_items'
  AND column_name IN ('unit_purchase_price', 'total_purchase_price')
ORDER BY column_name;

SELECT
  (
    SELECT count(*) FILTER (WHERE is_nullable = 'NO')
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'case_package_items'
      AND column_name IN ('unit_purchase_price', 'total_purchase_price')
  ) AS not_null_column_count,
  (
    SELECT count(*) = 2
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'case_package_items'
      AND column_name IN ('unit_purchase_price', 'total_purchase_price')
  ) AS both_columns_exist;

-- B) 件数（適用前後で不変）
SELECT 'cases' AS table_name, count(*)::bigint AS row_count FROM public.cases
UNION ALL
SELECT 'case_products', count(*)::bigint FROM public.case_products
UNION ALL
SELECT 'case_packages', count(*)::bigint FROM public.case_packages
UNION ALL
SELECT 'case_package_items', count(*)::bigint FROM public.case_package_items
UNION ALL
SELECT 'case_settlements', count(*)::bigint FROM public.case_settlements
UNION ALL
SELECT 'case_registration_requests', count(*)::bigint FROM public.case_registration_requests
ORDER BY table_name;

-- C) case_package_items 指紋（適用で変わってはいけない）
SELECT
  count(*)::bigint AS fingerprint_row_count,
  md5(string_agg(row_fp, '' ORDER BY row_fp)) AS case_package_items_fingerprint
FROM (
  SELECT md5(concat_ws('|',
    id::text,
    coalesce(case_package_id::text, ''),
    coalesce(product_id::text, ''),
    coalesce(source_package_item_id::text, ''),
    coalesce(quantity::text, ''),
    coalesce(unit_purchase_price::text, ''),
    coalesce(total_purchase_price::text, ''),
    coalesce(requirement_type, ''),
    coalesce(selection_group, ''),
    coalesce(is_selected::text, ''),
    coalesce(is_added_manually::text, ''),
    coalesce(is_hidden::text, ''),
    coalesce(sort_order::text, '')
  )) AS row_fp
  FROM public.case_package_items
) s;

-- D) 価格分布（適用で変わってはいけない）
SELECT
  count(*)::bigint AS total_rows,
  count(*) FILTER (WHERE unit_purchase_price IS NULL)::bigint AS unit_null,
  count(*) FILTER (WHERE total_purchase_price IS NULL)::bigint AS total_null,
  count(*) FILTER (WHERE unit_purchase_price IS NOT NULL)::bigint AS unit_non_null,
  count(*) FILTER (WHERE total_purchase_price IS NOT NULL)::bigint AS total_non_null,
  coalesce(sum(unit_purchase_price), 0)::numeric AS sum_unit_purchase_price,
  coalesce(sum(total_purchase_price), 0)::numeric AS sum_total_purchase_price
FROM public.case_package_items;

-- E) 関連制約（参考）
SELECT
  con.conname,
  con.contype,
  pg_get_constraintdef(con.oid) AS def
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'case_package_items'
ORDER BY con.conname;
