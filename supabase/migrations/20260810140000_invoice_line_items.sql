-- 請求明細（invoice_line_items）
-- Additive only。既存 invoices 行は明細 0 件のまま（print はフォールバック）。
-- 金額・品名は請求作成時の snapshot。商品マスタ価格変更の影響を受けない。

CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 1,
  line_kind text NOT NULL,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit text NULL,
  unit_price_ex_tax numeric NOT NULL DEFAULT 0,
  amount_ex_tax numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0.10,
  memo text NULL,
  case_product_id uuid NULL,
  source_product_id uuid NULL,
  source_package_id uuid NULL,
  CONSTRAINT invoice_line_items_kind_chk CHECK (
    line_kind IN ('product', 'package', 'custom')
  ),
  CONSTRAINT invoice_line_items_quantity_chk CHECK (quantity > 0),
  CONSTRAINT invoice_line_items_tax_rate_chk CHECK (
    tax_rate >= 0 AND tax_rate <= 1
  ),
  CONSTRAINT invoice_line_items_description_nonempty_chk CHECK (
    char_length(btrim(description)) > 0
  )
);

CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_id_sort_idx
  ON public.invoice_line_items (invoice_id, sort_order);

COMMENT ON TABLE public.invoice_line_items IS
  '請求明細スナップショット。product/package/custom。パッケージ内商品は展開しない。';

COMMENT ON COLUMN public.invoice_line_items.description IS
  '品名/摘要（作成時点の表示名）。';

COMMENT ON COLUMN public.invoice_line_items.unit_price_ex_tax IS
  '税抜単価スナップショット。';

COMMENT ON COLUMN public.invoice_line_items.amount_ex_tax IS
  '税抜金額スナップショット（通常 round(unit*qty)）。';

COMMENT ON COLUMN public.invoice_line_items.tax_rate IS
  '明細税率。現行計算は請求書単位 10%（floor）。将来の複数税率用に保持。';

-- 既存 invoices と同様、anon/authenticated からの CRUD を許可（クライアント作成経路）
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'invoice_line_items'
      AND policyname = 'invoice_line_items_all_anon'
  ) THEN
    CREATE POLICY invoice_line_items_all_anon
      ON public.invoice_line_items
      FOR ALL
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'invoice_line_items'
      AND policyname = 'invoice_line_items_all_authenticated'
  ) THEN
    CREATE POLICY invoice_line_items_all_authenticated
      ON public.invoice_line_items
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public.invoice_line_items TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public.invoice_line_items TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public.invoice_line_items TO authenticated;
  END IF;
END $$;
