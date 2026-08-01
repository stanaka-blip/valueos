-- =============================================================================
-- case_package_items 価格2列 NULL 許容 hotfix — 緊急ロールバック手順
-- Migration: 20260801120000_case_package_items_prices_nullable.sql
-- =============================================================================
-- 注意:
--   - hotfix 適用後に新RPCで PACKAGE 登録が走ると、両列に NULL 行が作られる
--   - NULL 行がある状態で SET NOT NULL すると失敗する（安全のため事前確認必須）
--   - 業務データの UPDATE/DELETE で NULL を埋めることは本スクリプトでは行わない
--   - RPC / DEFAULT / 権限は本 hotfix で変更していないため復元不要
-- =============================================================================

-- 1) ロールバック可否確認（NULL 行が 0 であること）
SELECT
  count(*) FILTER (WHERE unit_purchase_price IS NULL)::bigint AS unit_null,
  count(*) FILTER (WHERE total_purchase_price IS NULL)::bigint AS total_null
FROM public.case_package_items;

-- 2) NULL 行が 0 のときだけ、以下を実行して NOT NULL を戻す
--    （NULL がある場合は実行しないこと）
/*
DO $$
DECLARE
  v_unit_null bigint;
  v_total_null bigint;
BEGIN
  SELECT
    count(*) FILTER (WHERE unit_purchase_price IS NULL),
    count(*) FILTER (WHERE total_purchase_price IS NULL)
  INTO v_unit_null, v_total_null
  FROM public.case_package_items;

  IF v_unit_null > 0 OR v_total_null > 0 THEN
    RAISE EXCEPTION
      'Refusing SET NOT NULL: case_package_items has NULL price rows (unit=%, total=%)',
      v_unit_null, v_total_null;
  END IF;

  ALTER TABLE public.case_package_items
    ALTER COLUMN unit_purchase_price SET NOT NULL;
  ALTER TABLE public.case_package_items
    ALTER COLUMN total_purchase_price SET NOT NULL;
END $$;
*/

-- 3) ロールバック後確認
SELECT
  column_name,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'case_package_items'
  AND column_name IN ('unit_purchase_price', 'total_purchase_price')
ORDER BY column_name;
