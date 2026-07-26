-- =============================================================================
-- ValueOS Ver1.0
-- case_products 価格スナップショット DDL（Supabase SQL Editor 用・完成版）
--
-- 特徴:
--   ① 既存データで失敗しない
--   ② 途中実行済みでも再実行可能（冪等）
--   ③ CHECK は NOT VALID（既存行は検証しない）
--   ④ 列追加 → CHECK の2段階
--
-- 使い方:
--   Supabase Dashboard → SQL Editor にこのファイル全文を貼り付けて Run
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PART 1: 列追加・FK・インデックス
-- （migration: 20260726190000_case_products_price_snapshot.sql）
-- ---------------------------------------------------------------------------

ALTER TABLE public.case_products
  ADD COLUMN IF NOT EXISTS line_type text;

ALTER TABLE public.case_products
  ADD COLUMN IF NOT EXISTS package_id uuid;

ALTER TABLE public.case_products
  ADD COLUMN IF NOT EXISTS sales_price_id uuid;

ALTER TABLE public.case_products
  ADD COLUMN IF NOT EXISTS purchase_price_id uuid;

ALTER TABLE public.case_products
  ADD COLUMN IF NOT EXISTS is_manual_price boolean;

UPDATE public.case_products
SET line_type = 'PRODUCT'
WHERE line_type IS NULL;

UPDATE public.case_products
SET is_manual_price = false
WHERE is_manual_price IS NULL;

ALTER TABLE public.case_products
  ALTER COLUMN line_type SET DEFAULT 'PRODUCT';

ALTER TABLE public.case_products
  ALTER COLUMN line_type SET NOT NULL;

ALTER TABLE public.case_products
  ALTER COLUMN is_manual_price SET DEFAULT false;

ALTER TABLE public.case_products
  ALTER COLUMN is_manual_price SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_products_package_id_fkey'
      AND conrelid = 'public.case_products'::regclass
  ) THEN
    ALTER TABLE public.case_products
      ADD CONSTRAINT case_products_package_id_fkey
      FOREIGN KEY (package_id)
      REFERENCES public.packages (id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_products_sales_price_id_fkey'
      AND conrelid = 'public.case_products'::regclass
  ) THEN
    ALTER TABLE public.case_products
      ADD CONSTRAINT case_products_sales_price_id_fkey
      FOREIGN KEY (sales_price_id)
      REFERENCES public.sales_prices (id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_products_purchase_price_id_fkey'
      AND conrelid = 'public.case_products'::regclass
  ) THEN
    ALTER TABLE public.case_products
      ADD CONSTRAINT case_products_purchase_price_id_fkey
      FOREIGN KEY (purchase_price_id)
      REFERENCES public.purchase_prices (id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.case_products
  ALTER COLUMN product_id DROP NOT NULL;

COMMENT ON COLUMN public.case_products.line_type IS
  '明細種別: PRODUCT（商品） / PACKAGE（パッケージ商品）';

COMMENT ON COLUMN public.case_products.package_id IS
  'パッケージ商品ID。line_type = PACKAGE のとき必須。';

COMMENT ON COLUMN public.case_products.sales_price_id IS
  '案件登録時に参照した販売価格マスタID（スナップショット参照用）。';

COMMENT ON COLUMN public.case_products.purchase_price_id IS
  '案件登録時に参照した仕入価格マスタID（スナップショット参照用）。';

COMMENT ON COLUMN public.case_products.is_manual_price IS
  '販売価格または仕入価格を手動変更した場合 true。';

CREATE INDEX IF NOT EXISTS case_products_package_id_idx
  ON public.case_products (package_id);

CREATE INDEX IF NOT EXISTS case_products_line_type_idx
  ON public.case_products (line_type);

CREATE INDEX IF NOT EXISTS case_products_sales_price_id_idx
  ON public.case_products (sales_price_id);

CREATE INDEX IF NOT EXISTS case_products_purchase_price_id_idx
  ON public.case_products (purchase_price_id);

-- ---------------------------------------------------------------------------
-- PART 2: CHECK（NOT VALID）
-- （migration: 20260726190100_case_products_line_target_check.sql）
-- 既存行は検証しない。VALIDATE CONSTRAINT は将来の清掃後に実施。
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 確認用（任意）
-- ---------------------------------------------------------------------------
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'case_products'
--   AND column_name IN (
--     'line_type', 'package_id', 'sales_price_id', 'purchase_price_id', 'is_manual_price', 'product_id'
--   )
-- ORDER BY column_name;
--
-- SELECT conname, pg_get_constraintdef(oid) AS def, convalidated
-- FROM pg_constraint
-- WHERE conrelid = 'public.case_products'::regclass
--   AND conname = 'case_products_line_target_check';
