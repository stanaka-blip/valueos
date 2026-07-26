-- Ver1.0: case_products の明細対象 CHECK を NOT VALID で追加
--
-- 既存行は検証しない（product_id IS NULL 等があっても失敗しない）。
-- 新規 INSERT / UPDATE のみ制約される。
-- VALIDATE CONSTRAINT はデータ清掃後の将来対応（本 migration では行わない）。

ALTER TABLE public.case_products
  DROP CONSTRAINT IF EXISTS case_products_line_target_check;

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
