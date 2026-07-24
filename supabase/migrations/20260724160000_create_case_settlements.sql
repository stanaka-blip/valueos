-- case_settlements: 案件ごとの決済条件（1案件1行）
-- Additive only. Does not alter or drop existing tables/data.
-- Apply in Supabase SQL Editor when Phase1 tables are missing.
-- Compatible with app SettlementForm / lib/repositories/caseSettlements.ts
-- (settlement_type のみでも保存可: 他カラムは NULL 可、fee_amount は DEFAULT 0)

CREATE TABLE IF NOT EXISTS public.case_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  case_id uuid NOT NULL REFERENCES public.cases (id) ON DELETE CASCADE,
  settlement_type text NOT NULL,
  fee_rate numeric,
  fee_amount numeric NOT NULL DEFAULT 0,
  deposit_rate numeric,
  deposit_amount numeric,
  payment_terms text,
  card_brand text,
  memo text,
  CONSTRAINT case_settlements_case_id_key UNIQUE (case_id)
);

CREATE INDEX IF NOT EXISTS case_settlements_case_id_idx
  ON public.case_settlements (case_id);

CREATE INDEX IF NOT EXISTS case_settlements_settlement_type_idx
  ON public.case_settlements (settlement_type);

COMMENT ON TABLE public.case_settlements IS
  '案件決済条件。Phase1で追加。既存 cases 列は変更しない。';

COMMENT ON COLUMN public.case_settlements.settlement_type IS
  '三社間決済 / 前金 / 掛売 / カード / その他';

COMMENT ON COLUMN public.case_settlements.fee_rate IS
  '決済手数料率（%）';

COMMENT ON COLUMN public.case_settlements.fee_amount IS
  '決済手数料額';

COMMENT ON COLUMN public.case_settlements.deposit_rate IS
  '前金率（%）';

COMMENT ON COLUMN public.case_settlements.deposit_amount IS
  '前金額';

CREATE OR REPLACE FUNCTION public.valueos_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS case_settlements_set_updated_at ON public.case_settlements;
CREATE TRIGGER case_settlements_set_updated_at
  BEFORE UPDATE ON public.case_settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

-- 既存アプリは publishable(anon) キーで CRUD しているため同等権限を付与
-- RLS は既存テーブル運用に合わせ当面無効（後続で強化可能）
ALTER TABLE public.case_settlements DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_settlements TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_settlements TO service_role;
