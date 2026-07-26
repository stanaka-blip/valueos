-- PR25-1: 決済区分別 Workflow 用ステータス・完工日
-- Additive only. deposit_confirmed は作らない（将来は請求・入金データから判定）。

ALTER TABLE public.case_settlements
  ADD COLUMN IF NOT EXISTS loan_status text,
  ADD COLUMN IF NOT EXISTS loan_status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS card_status text,
  ADD COLUMN IF NOT EXISTS card_status_updated_at timestamptz;

COMMENT ON COLUMN public.case_settlements.loan_status IS
  'ローン進捗ステータス（拡張可能）。例: 未申請 / 申請中 / 承認済 / 否認';

COMMENT ON COLUMN public.case_settlements.card_status IS
  'カード決済ステータス（拡張可能）。例: 未決済 / 処理中 / 決済成功 / 決済失敗 / 取消';

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS construction_completed_date date;

COMMENT ON COLUMN public.cases.construction_completed_date IS
  '完工日（実績）。ローン案件の請求トリガーに使用。';
