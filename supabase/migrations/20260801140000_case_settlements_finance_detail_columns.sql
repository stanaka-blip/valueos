-- 決済詳細用列追加（additive only）
--
-- - finance_company / approval_number を NULL 可 text で追加
-- - card_brand は既存列をカード会社名として利用（COMMENT のみ更新）
-- - 既存行は UPDATE/DELETE しない
-- - settlement_type の変換・CHECK 制約は行わない
-- - 再実行可能（ADD COLUMN IF NOT EXISTS）

ALTER TABLE public.case_settlements
  ADD COLUMN IF NOT EXISTS finance_company text;

ALTER TABLE public.case_settlements
  ADD COLUMN IF NOT EXISTS approval_number text;

COMMENT ON COLUMN public.case_settlements.finance_company IS
  '信販会社名。3社間決済で利用。NULL可。';

COMMENT ON COLUMN public.case_settlements.approval_number IS
  '承認番号。3社間決済で利用。NULL可。';

COMMENT ON COLUMN public.case_settlements.card_brand IS
  'カード会社名として利用。カード決済で利用。NULL可。';
