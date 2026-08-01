-- Hotfix: case_package_items 価格列を案件登録時の NULL 保存に対応
--
-- - unit_purchase_price / total_purchase_price が NOT NULL のときだけ DROP NOT NULL
-- - 既存業務行は UPDATE/DELETE しない
-- - DEFAULT / RPC / 権限は変更しない
-- - 再実行可能（既に NULL 可なら no-op）

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'case_package_items'
      AND column_name IN (
        'unit_purchase_price',
        'total_purchase_price'
      )
      AND is_nullable = 'NO'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.case_package_items ALTER COLUMN %I DROP NOT NULL',
      r.column_name
    );
  END LOOP;
END $$;

COMMENT ON COLUMN public.case_package_items.unit_purchase_price IS
  '構成品の仕入単価スナップショット。案件登録時はNULL可。既存行の値は維持。';
COMMENT ON COLUMN public.case_package_items.total_purchase_price IS
  '構成品の仕入金額スナップショット。案件登録時はNULL可。既存行の値は維持。';
