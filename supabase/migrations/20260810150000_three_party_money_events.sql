-- PR1: 3社間決済の金銭イベント台帳（Schema only）
-- Additive only。既存 invoices / payments / orders / case_settlements は変更しない。
-- 書込は service_role のみ（gateway 前提）。anon/authenticated 直 insert は不可。
-- 物理DELETEで帳尻を合わせない。取消/訂正（corrects_id）で履歴を残す。

-- ---------------------------------------------------------------------------
-- 共通 updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.valueos_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- finance_receipts: 信販入金（payments とは別系統）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  case_id uuid NOT NULL REFERENCES public.cases (id) ON DELETE RESTRICT,
  finance_company text NOT NULL,
  scheduled_date date NULL,
  scheduled_amount numeric NOT NULL DEFAULT 0,
  actual_date date NULL,
  actual_amount numeric NULL,
  status text NOT NULL DEFAULT '予定',
  memo text NULL,
  cancelled_at timestamptz NULL,
  cancel_reason text NULL,
  corrects_id uuid NULL REFERENCES public.finance_receipts (id) ON DELETE SET NULL,
  CONSTRAINT finance_receipts_status_chk CHECK (
    status IN ('予定', '入金済', '取消')
  ),
  CONSTRAINT finance_receipts_finance_company_nonempty_chk CHECK (
    char_length(btrim(finance_company)) > 0
  ),
  CONSTRAINT finance_receipts_scheduled_amount_chk CHECK (scheduled_amount >= 0),
  CONSTRAINT finance_receipts_actual_amount_chk CHECK (
    actual_amount IS NULL OR actual_amount >= 0
  )
);

CREATE INDEX IF NOT EXISTS finance_receipts_case_id_idx
  ON public.finance_receipts (case_id);

CREATE INDEX IF NOT EXISTS finance_receipts_status_idx
  ON public.finance_receipts (status);

CREATE INDEX IF NOT EXISTS finance_receipts_scheduled_date_idx
  ON public.finance_receipts (scheduled_date);

CREATE INDEX IF NOT EXISTS finance_receipts_corrects_id_idx
  ON public.finance_receipts (corrects_id);

COMMENT ON TABLE public.finance_receipts IS
  '信販会社からの入金イベント。既存 payments（請求AR）とは独立。取消で無効化し物理DELETEしない。';

COMMENT ON COLUMN public.finance_receipts.finance_company IS
  '信販会社名スナップショット（作成/確定時点）。';

COMMENT ON COLUMN public.finance_receipts.scheduled_amount IS
  '予定入金額スナップショット。';

COMMENT ON COLUMN public.finance_receipts.actual_amount IS
  '実入金額スナップショット。入金済時に保持。';

COMMENT ON COLUMN public.finance_receipts.corrects_id IS
  '訂正元レコード。取消後に新行を作る訂正チェーン用。';

COMMENT ON COLUMN public.finance_receipts.status IS
  '予定 / 入金済 / 取消。表示用の未入金・期限超過はアプリ導出。';

DROP TRIGGER IF EXISTS finance_receipts_set_updated_at ON public.finance_receipts;
CREATE TRIGGER finance_receipts_set_updated_at
  BEFORE UPDATE ON public.finance_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

-- ---------------------------------------------------------------------------
-- dealer_settlements: 仕切清算書 + 販売店支払（初期版は一体）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dealer_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  case_id uuid NOT NULL REFERENCES public.cases (id) ON DELETE RESTRICT,
  dealer_id uuid NOT NULL REFERENCES public.dealers (id) ON DELETE RESTRICT,
  statement_no text NULL,
  issue_date date NULL,
  finance_receipt_id uuid NULL REFERENCES public.finance_receipts (id) ON DELETE SET NULL,
  invoice_id uuid NULL REFERENCES public.invoices (id) ON DELETE SET NULL,
  credit_received_amount numeric NOT NULL DEFAULT 0,
  ve_share_amount numeric NOT NULL DEFAULT 0,
  adjustment_total_amount numeric NOT NULL DEFAULT 0,
  payout_amount numeric NOT NULL DEFAULT 0,
  scheduled_payout_date date NULL,
  actual_payout_date date NULL,
  actual_payout_amount numeric NULL,
  contract_date date NULL,
  delivery_date date NULL,
  status text NOT NULL DEFAULT '下書き',
  memo text NULL,
  cancelled_at timestamptz NULL,
  cancel_reason text NULL,
  corrects_id uuid NULL REFERENCES public.dealer_settlements (id) ON DELETE SET NULL,
  CONSTRAINT dealer_settlements_status_chk CHECK (
    status IN ('下書き', '確定', '支払済', '取消')
  ),
  CONSTRAINT dealer_settlements_credit_amount_chk CHECK (credit_received_amount >= 0),
  CONSTRAINT dealer_settlements_ve_share_chk CHECK (ve_share_amount >= 0),
  CONSTRAINT dealer_settlements_adjustment_total_chk CHECK (adjustment_total_amount >= 0),
  CONSTRAINT dealer_settlements_actual_payout_chk CHECK (
    actual_payout_amount IS NULL OR actual_payout_amount >= 0
  )
);

CREATE INDEX IF NOT EXISTS dealer_settlements_case_id_idx
  ON public.dealer_settlements (case_id);

CREATE INDEX IF NOT EXISTS dealer_settlements_dealer_id_idx
  ON public.dealer_settlements (dealer_id);

CREATE INDEX IF NOT EXISTS dealer_settlements_status_idx
  ON public.dealer_settlements (status);

CREATE INDEX IF NOT EXISTS dealer_settlements_scheduled_payout_date_idx
  ON public.dealer_settlements (scheduled_payout_date);

CREATE INDEX IF NOT EXISTS dealer_settlements_finance_receipt_id_idx
  ON public.dealer_settlements (finance_receipt_id);

CREATE INDEX IF NOT EXISTS dealer_settlements_invoice_id_idx
  ON public.dealer_settlements (invoice_id);

CREATE INDEX IF NOT EXISTS dealer_settlements_corrects_id_idx
  ON public.dealer_settlements (corrects_id);

COMMENT ON TABLE public.dealer_settlements IS
  '仕切清算書ヘッダ兼販売店支払。確定金額は snapshot。既存 invoices とは別書類。';

COMMENT ON COLUMN public.dealer_settlements.credit_received_amount IS
  '信販入金額スナップショット（確定時）。';

COMMENT ON COLUMN public.dealer_settlements.ve_share_amount IS
  'Value Ecology 請求/取り分スナップショット（確定時）。';

COMMENT ON COLUMN public.dealer_settlements.adjustment_total_amount IS
  '手数料・値引・相殺等の控除合計スナップショット。';

COMMENT ON COLUMN public.dealer_settlements.payout_amount IS
  '販売店への御振込金額スナップショット。credit - ve_share - adjustments。';

COMMENT ON COLUMN public.dealer_settlements.status IS
  '下書き / 確定 / 支払済 / 取消。期限超過はアプリ導出。';

DROP TRIGGER IF EXISTS dealer_settlements_set_updated_at ON public.dealer_settlements;
CREATE TRIGGER dealer_settlements_set_updated_at
  BEFORE UPDATE ON public.dealer_settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

-- ---------------------------------------------------------------------------
-- dealer_settlement_lines: 仕切調整明細
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dealer_settlement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  dealer_settlement_id uuid NOT NULL
    REFERENCES public.dealer_settlements (id) ON DELETE RESTRICT,
  sort_order int NOT NULL DEFAULT 1,
  line_kind text NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  memo text NULL,
  CONSTRAINT dealer_settlement_lines_kind_chk CHECK (
    line_kind IN (
      'credit_in',
      've_share',
      'transfer_fee',
      'discount',
      'offset',
      'other'
    )
  ),
  CONSTRAINT dealer_settlement_lines_description_nonempty_chk CHECK (
    char_length(btrim(description)) > 0
  )
);

CREATE INDEX IF NOT EXISTS dealer_settlement_lines_settlement_id_sort_idx
  ON public.dealer_settlement_lines (dealer_settlement_id, sort_order);

COMMENT ON TABLE public.dealer_settlement_lines IS
  '仕切清算明細。credit_in/ve_share は表示用、transfer_fee/discount/offset/other は控除調整。';

COMMENT ON COLUMN public.dealer_settlement_lines.amount IS
  '明細金額。調整種別は控除額を正数で保持（payout = credit - ve_share - Σadjustments）。';

COMMENT ON COLUMN public.dealer_settlement_lines.line_kind IS
  'credit_in / ve_share / transfer_fee / discount / offset / other';

-- ---------------------------------------------------------------------------
-- supplier_payments: 仕入先支払（発注 1:N を許容）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  case_id uuid NOT NULL REFERENCES public.cases (id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.suppliers (id) ON DELETE RESTRICT,
  order_id uuid NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
  due_date date NULL,
  scheduled_amount numeric NOT NULL DEFAULT 0,
  paid_date date NULL,
  paid_amount numeric NULL,
  status text NOT NULL DEFAULT '予定',
  memo text NULL,
  cancelled_at timestamptz NULL,
  cancel_reason text NULL,
  corrects_id uuid NULL REFERENCES public.supplier_payments (id) ON DELETE SET NULL,
  CONSTRAINT supplier_payments_status_chk CHECK (
    status IN ('予定', '支払済', '取消')
  ),
  CONSTRAINT supplier_payments_scheduled_amount_chk CHECK (scheduled_amount >= 0),
  CONSTRAINT supplier_payments_paid_amount_chk CHECK (
    paid_amount IS NULL OR paid_amount >= 0
  )
);

CREATE INDEX IF NOT EXISTS supplier_payments_case_id_idx
  ON public.supplier_payments (case_id);

CREATE INDEX IF NOT EXISTS supplier_payments_supplier_id_idx
  ON public.supplier_payments (supplier_id);

CREATE INDEX IF NOT EXISTS supplier_payments_order_id_idx
  ON public.supplier_payments (order_id);

CREATE INDEX IF NOT EXISTS supplier_payments_status_idx
  ON public.supplier_payments (status);

CREATE INDEX IF NOT EXISTS supplier_payments_due_date_idx
  ON public.supplier_payments (due_date);

CREATE INDEX IF NOT EXISTS supplier_payments_corrects_id_idx
  ON public.supplier_payments (corrects_id);

COMMENT ON TABLE public.supplier_payments IS
  '仕入先支払イベント。orders に対して 1:N。信販入金完了を前提にしない。取消で無効化。';

COMMENT ON COLUMN public.supplier_payments.order_id IS
  '対象発注。NULL可（案件単位の支払）。同一 order_id への複数行を許容。';

COMMENT ON COLUMN public.supplier_payments.scheduled_amount IS
  '支払予定額スナップショット。';

COMMENT ON COLUMN public.supplier_payments.paid_amount IS
  '実支払額スナップショット。';

COMMENT ON COLUMN public.supplier_payments.status IS
  '予定 / 支払済 / 取消。期限超過はアプリ導出。';

DROP TRIGGER IF EXISTS supplier_payments_set_updated_at ON public.supplier_payments;
CREATE TRIGGER supplier_payments_set_updated_at
  BEFORE UPDATE ON public.supplier_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

-- ---------------------------------------------------------------------------
-- 権限: service_role のみ（gateway 経由）。anon/authenticated は不可。
-- RLS policy 0 件。service_role は BYPASSRLS。
-- ---------------------------------------------------------------------------
ALTER TABLE public.finance_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealer_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealer_settlement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.finance_receipts FROM PUBLIC;
REVOKE ALL ON TABLE public.dealer_settlements FROM PUBLIC;
REVOKE ALL ON TABLE public.dealer_settlement_lines FROM PUBLIC;
REVOKE ALL ON TABLE public.supplier_payments FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.finance_receipts FROM anon;
    REVOKE ALL ON TABLE public.dealer_settlements FROM anon;
    REVOKE ALL ON TABLE public.dealer_settlement_lines FROM anon;
    REVOKE ALL ON TABLE public.supplier_payments FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.finance_receipts FROM authenticated;
    REVOKE ALL ON TABLE public.dealer_settlements FROM authenticated;
    REVOKE ALL ON TABLE public.dealer_settlement_lines FROM authenticated;
    REVOKE ALL ON TABLE public.supplier_payments FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public.finance_receipts TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public.dealer_settlements TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public.dealer_settlement_lines TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public.supplier_payments TO service_role;
  END IF;
END $$;
