-- Ver1.0: 案件明細 (case_products) に価格スナップショット参照を追加
-- Additive / 既存行は PRODUCT・手動フラグ false として扱う。
-- price_fetched_at / revision_no は今回追加しない（将来拡張用に余白を残す）。

-- ---------------------------------------------------------------------------
-- case_products
-- ---------------------------------------------------------------------------
ALTER TABLE public.case_products
  ADD COLUMN IF NOT EXISTS line_type text NOT NULL DEFAULT 'PRODUCT',
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.packages (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_price_id uuid REFERENCES public.sales_prices (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_price_id uuid REFERENCES public.purchase_prices (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_manual_price boolean NOT NULL DEFAULT false;

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

-- PACKAGE 明細を保存できるよう product_id を NULL 許容にする
ALTER TABLE public.case_products
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.case_products
  DROP CONSTRAINT IF EXISTS case_products_line_target_check;

ALTER TABLE public.case_products
  ADD CONSTRAINT case_products_line_target_check CHECK (
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
  );

CREATE INDEX IF NOT EXISTS case_products_package_id_idx
  ON public.case_products (package_id);

CREATE INDEX IF NOT EXISTS case_products_line_type_idx
  ON public.case_products (line_type);

CREATE INDEX IF NOT EXISTS case_products_sales_price_id_idx
  ON public.case_products (sales_price_id);

CREATE INDEX IF NOT EXISTS case_products_purchase_price_id_idx
  ON public.case_products (purchase_price_id);
