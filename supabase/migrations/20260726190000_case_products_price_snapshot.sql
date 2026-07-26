-- Ver1.0: 案件明細 (case_products) に価格スナップショット参照を追加
-- Additive / 既存行を壊さない。
-- price_fetched_at / revision_no は本 migration では追加しない（別 migration）。
--
-- 注意:
--   CHECK 制約は別 migration（20260726190100）で NOT VALID 追加する。
--   既存行に product_id IS NULL 等があると VALIDATE は失敗するため分離している。
--
-- 本番再適用:
--   列・FK・Index は IF NOT EXISTS / pg_constraint 存在確認で破壊しない。
--   ただし Supabase migration history との不一致は SQL 冪等性だけでは解消できない。
--   既存制約名があり定義が期待と異なる場合は削除・置換せず例外で停止する。

-- ---------------------------------------------------------------------------
-- 1) 列追加（途中失敗後の再実行にも耐えられるよう IF NOT EXISTS）
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

-- ---------------------------------------------------------------------------
-- 2) デフォルト・NOT NULL（新規環境構築用。既に埋まっている行は変更されない）
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3) FK（未作成時のみ。既存定義が期待と異なる場合は停止）
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  def text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_products_package_id_fkey'
      AND conrelid = 'public.case_products'::regclass
  ) THEN
    SELECT pg_get_constraintdef(c.oid)
      INTO def
    FROM pg_constraint c
    WHERE c.conname = 'case_products_package_id_fkey'
      AND c.conrelid = 'public.case_products'::regclass;

    IF def IS NULL
       OR def !~* 'FOREIGN KEY \(package_id\) REFERENCES (public\.)?packages\(id\)'
    THEN
      RAISE EXCEPTION
        'case_products_package_id_fkey exists with unexpected definition: %',
        def;
    END IF;
  ELSE
    ALTER TABLE public.case_products
      ADD CONSTRAINT case_products_package_id_fkey
      FOREIGN KEY (package_id)
      REFERENCES public.packages (id)
      ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_products_sales_price_id_fkey'
      AND conrelid = 'public.case_products'::regclass
  ) THEN
    SELECT pg_get_constraintdef(c.oid)
      INTO def
    FROM pg_constraint c
    WHERE c.conname = 'case_products_sales_price_id_fkey'
      AND c.conrelid = 'public.case_products'::regclass;

    IF def IS NULL
       OR def !~* 'FOREIGN KEY \(sales_price_id\) REFERENCES (public\.)?sales_prices\(id\)'
    THEN
      RAISE EXCEPTION
        'case_products_sales_price_id_fkey exists with unexpected definition: %',
        def;
    END IF;
  ELSE
    ALTER TABLE public.case_products
      ADD CONSTRAINT case_products_sales_price_id_fkey
      FOREIGN KEY (sales_price_id)
      REFERENCES public.sales_prices (id)
      ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_products_purchase_price_id_fkey'
      AND conrelid = 'public.case_products'::regclass
  ) THEN
    SELECT pg_get_constraintdef(c.oid)
      INTO def
    FROM pg_constraint c
    WHERE c.conname = 'case_products_purchase_price_id_fkey'
      AND c.conrelid = 'public.case_products'::regclass;

    IF def IS NULL
       OR def !~* 'FOREIGN KEY \(purchase_price_id\) REFERENCES (public\.)?purchase_prices\(id\)'
    THEN
      RAISE EXCEPTION
        'case_products_purchase_price_id_fkey exists with unexpected definition: %',
        def;
    END IF;
  ELSE
    ALTER TABLE public.case_products
      ADD CONSTRAINT case_products_purchase_price_id_fkey
      FOREIGN KEY (purchase_price_id)
      REFERENCES public.purchase_prices (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) PACKAGE 明細を保存できるよう product_id を NULL 許容
-- ---------------------------------------------------------------------------
ALTER TABLE public.case_products
  ALTER COLUMN product_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 5) コメント
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 6) インデックス
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS case_products_package_id_idx
  ON public.case_products (package_id);

CREATE INDEX IF NOT EXISTS case_products_line_type_idx
  ON public.case_products (line_type);

CREATE INDEX IF NOT EXISTS case_products_sales_price_id_idx
  ON public.case_products (sales_price_id);

CREATE INDEX IF NOT EXISTS case_products_purchase_price_id_idx
  ON public.case_products (purchase_price_id);
