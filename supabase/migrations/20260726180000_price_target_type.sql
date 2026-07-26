-- 仕入価格・販売価格マスタ: 価格対象種別（PRODUCT / PACKAGE）
-- Additive. 既存行は PRODUCT として扱う。

-- ---------------------------------------------------------------------------
-- purchase_prices
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_prices
  ADD COLUMN IF NOT EXISTS price_target_type text NOT NULL DEFAULT 'PRODUCT',
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.packages (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.purchase_prices.price_target_type IS
  '価格対象種別: PRODUCT（商品） / PACKAGE（パッケージ商品）';

COMMENT ON COLUMN public.purchase_prices.package_id IS
  'パッケージ商品ID。price_target_type = PACKAGE のとき必須。';

-- PACKAGE 行を保存できるよう product_id を NULL 許容にする
ALTER TABLE public.purchase_prices
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.purchase_prices
  DROP CONSTRAINT IF EXISTS purchase_prices_target_check;

ALTER TABLE public.purchase_prices
  ADD CONSTRAINT purchase_prices_target_check CHECK (
    (
      price_target_type = 'PRODUCT'
      AND product_id IS NOT NULL
      AND package_id IS NULL
    )
    OR (
      price_target_type = 'PACKAGE'
      AND package_id IS NOT NULL
      AND product_id IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS purchase_prices_package_id_idx
  ON public.purchase_prices (package_id);

CREATE INDEX IF NOT EXISTS purchase_prices_price_target_type_idx
  ON public.purchase_prices (price_target_type);

-- ---------------------------------------------------------------------------
-- sales_prices
-- ---------------------------------------------------------------------------
ALTER TABLE public.sales_prices
  ADD COLUMN IF NOT EXISTS price_target_type text NOT NULL DEFAULT 'PRODUCT',
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.packages (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sales_prices.price_target_type IS
  '価格対象種別: PRODUCT（商品） / PACKAGE（パッケージ商品）';

COMMENT ON COLUMN public.sales_prices.package_id IS
  'パッケージ商品ID。price_target_type = PACKAGE のとき必須。';

ALTER TABLE public.sales_prices
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.sales_prices
  DROP CONSTRAINT IF EXISTS sales_prices_target_check;

ALTER TABLE public.sales_prices
  ADD CONSTRAINT sales_prices_target_check CHECK (
    (
      price_target_type = 'PRODUCT'
      AND product_id IS NOT NULL
      AND package_id IS NULL
    )
    OR (
      price_target_type = 'PACKAGE'
      AND package_id IS NOT NULL
      AND product_id IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS sales_prices_package_id_idx
  ON public.sales_prices (package_id);

CREATE INDEX IF NOT EXISTS sales_prices_price_target_type_idx
  ON public.sales_prices (price_target_type);
