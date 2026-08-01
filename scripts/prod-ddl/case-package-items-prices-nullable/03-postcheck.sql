-- =============================================================================
-- case_package_items 価格2列 NULL 許容 hotfix — 適用後確認（SELECT のみ）
-- Migration: 20260801120000_case_package_items_prices_nullable.sql
-- =============================================================================
-- PASS 条件:
--   1) unit_purchase_price / total_purchase_price が is_nullable = YES
--   2) case_package_items_fingerprint が適用前と一致
--   3) 各テーブル件数が適用前と一致
--   4) 価格分布（NULL/非NULL件数・合計）が適用前と一致
-- ※ このスクリプトでは RPC を呼び出して案件を作成しない
-- =============================================================================

-- A) nullability（2列とも YES）
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'case_package_items'
  AND column_name IN ('unit_purchase_price', 'total_purchase_price')
ORDER BY column_name;

SELECT
  (
    SELECT count(*) = 2
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'case_package_items'
      AND column_name IN ('unit_purchase_price', 'total_purchase_price')
      AND is_nullable = 'YES'
  ) AS columns_nullable_ok;

-- B) 件数（適用前と比較）
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

-- C) fingerprint（適用前と完全一致必須）
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

-- D) 価格分布（適用前と一致）
SELECT
  count(*)::bigint AS total_rows,
  count(*) FILTER (WHERE unit_purchase_price IS NULL)::bigint AS unit_null,
  count(*) FILTER (WHERE total_purchase_price IS NULL)::bigint AS total_null,
  count(*) FILTER (WHERE unit_purchase_price IS NOT NULL)::bigint AS unit_non_null,
  count(*) FILTER (WHERE total_purchase_price IS NOT NULL)::bigint AS total_non_null,
  coalesce(sum(unit_purchase_price), 0)::numeric AS sum_unit_purchase_price,
  coalesce(sum(total_purchase_price), 0)::numeric AS sum_total_purchase_price
FROM public.case_package_items;

-- E) 判定サマリ（columns_nullable_ok が true なら schema PASS。件数/指紋は人手比較）
SELECT
  (
    SELECT count(*) = 2
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'case_package_items'
      AND column_name IN ('unit_purchase_price', 'total_purchase_price')
      AND is_nullable = 'YES'
  ) AS columns_nullable_ok,
  (
    SELECT count(*) FILTER (WHERE column_default IS NOT NULL) = 0
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'case_package_items'
      AND column_name IN ('unit_purchase_price', 'total_purchase_price')
  ) AS no_default_added_ok;
