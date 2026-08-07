-- invoices: 請求税額スナップショット（税抜・消費税）
-- 正式ルール: tax = floor(subtotal_ex_tax * 0.10), invoice_amount = subtotal + tax
-- 既存行は NULL のまま（バックフィルしない）。invoice_amount は変更しない。

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS subtotal_ex_tax numeric;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS tax_amount numeric;

COMMENT ON COLUMN public.invoices.subtotal_ex_tax IS
  '請求書単位の税抜合計スナップショット。新規自動計算時のみ保存。手入力・既存行は NULL。';

COMMENT ON COLUMN public.invoices.tax_amount IS
  '請求書単位の消費税額スナップショット。floor(subtotal_ex_tax * 0.10)。手入力・既存行は NULL。';

COMMENT ON COLUMN public.invoices.invoice_amount IS
  '税込請求金額（正式値）。既存どおり。';

-- スナップショットがあるときだけ整合を強制（NULL は既存・手入力を許容）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_tax_snapshot_consistency_chk'
      AND conrelid = 'public.invoices'::regclass
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_tax_snapshot_consistency_chk
      CHECK (
        subtotal_ex_tax IS NULL
        OR tax_amount IS NULL
        OR invoice_amount IS NULL
        OR invoice_amount = subtotal_ex_tax + tax_amount
      );
  END IF;
END $$;
