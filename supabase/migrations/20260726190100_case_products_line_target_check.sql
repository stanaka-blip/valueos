-- Ver1.0: case_products の明細対象 CHECK を NOT VALID で追加
--
-- 既存行は検証しない（product_id IS NULL 等があっても失敗しない）。
-- 新規 INSERT / UPDATE のみ拘束される。
-- VALIDATE CONSTRAINT はデータ清掃後の将来対応（本 migration では行わない）。
--
-- 既存制約がある場合は再作成しない。
-- 定義が期待と異なる場合は削除・置換せず例外で停止する。

DO $$
DECLARE
  def text;
  is_validated boolean;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_products_line_target_check'
      AND conrelid = 'public.case_products'::regclass
  ) THEN
    SELECT pg_get_constraintdef(c.oid), c.convalidated
      INTO def, is_validated
    FROM pg_constraint c
    WHERE c.conname = 'case_products_line_target_check'
      AND c.conrelid = 'public.case_products'::regclass;

    IF def IS NULL
       OR def !~* 'line_type\s*=\s*''PRODUCT'''
       OR def !~* 'line_type\s*=\s*''PACKAGE'''
       OR def !~* 'product_id IS NOT NULL'
       OR def !~* 'package_id IS NULL'
       OR def !~* 'package_id IS NOT NULL'
       OR def !~* 'product_id IS NULL'
    THEN
      RAISE EXCEPTION
        'case_products_line_target_check exists with unexpected definition: %',
        def;
    END IF;

    -- 期待は NOT VALID（convalidated = false）。
    -- 既に VALIDATE 済みの場合はより厳しい状態なので残置し、再作成しない。
    RAISE NOTICE
      'case_products_line_target_check already exists (validated=%); skipping recreate. def=%',
      is_validated,
      def;
  ELSE
    ALTER TABLE public.case_products
      ADD CONSTRAINT case_products_line_target_check
      CHECK (
        (
          line_type = 'PRODUCT'
          AND product_id IS NOT NULL
          AND package_id IS NULL
        )
        OR (
          line_type = 'PACKAGE'
          AND package_id IS NOT NULL
          AND product_id IS NULL
        )
      ) NOT VALID;
  END IF;
END $$;
