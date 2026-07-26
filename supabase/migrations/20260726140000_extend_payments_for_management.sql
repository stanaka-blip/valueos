-- PR26: 入金管理拡張（既存 payments を破壊しない additive 変更）
-- 入金は invoice_id に紐づく。case_id は既存どおり任意保持。

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payer_name text,
  ADD COLUMN IF NOT EXISTS bank_account text;

COMMENT ON COLUMN public.payments.payment_method IS
  '入金方法: 銀行振込 / カード / ローン会社 / 現金 / 相殺 / その他';

COMMENT ON COLUMN public.payments.payer_name IS
  '振込名義';

COMMENT ON COLUMN public.payments.bank_account IS
  '入金先口座';

COMMENT ON COLUMN public.payments.status IS
  '確認待ち / 入金確認済 / 取消（旧: 入金確認中 は確認待ち相当）。DB default の未入金は将来 確認待ち へ整理予定';

-- 注記:
-- - 新規登録はアプリ側で invoice_id 必須・payment_amount > 0・case_id は invoices.case_id から決定
-- - invoice_id の DB NOT NULL 化は既存 NULL データ確認後に別マイグレーションで実施
-- - status DEFAULT '未入金' → '確認待ち' も同様に将来整理

CREATE INDEX IF NOT EXISTS payments_invoice_id_idx
  ON public.payments (invoice_id);

CREATE INDEX IF NOT EXISTS payments_status_idx
  ON public.payments (status);

CREATE INDEX IF NOT EXISTS payments_payment_date_idx
  ON public.payments (payment_date);
