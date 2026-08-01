-- case_settlements.settlement_type 正規化（再実行可）
--
-- 正式値: 前金 / 売掛 / 3社間決済 / カード
-- 移行:
--   掛売 → 売掛
--   ローン / 三社間決済 → 3社間決済
-- 保持:
--   前金 / 売掛 / カード / その他（その他は正式区分に含めない）
--
-- - settlement_type 以外の列は更新しない（updated_at トリガーも一時停止）
-- - CHECK 制約は追加しない
-- - RPC / UI は変更しない

COMMENT ON COLUMN public.case_settlements.settlement_type IS
  '正式値: 前金 / 売掛 / 3社間決済 / カード。レガシー「その他」等は移行対象外として保持可。';

DO $$
BEGIN
  -- updated_at 自動更新を止め、settlement_type 以外を不変にする
  ALTER TABLE public.case_settlements
    DISABLE TRIGGER case_settlements_set_updated_at;

  UPDATE public.case_settlements
  SET settlement_type = '売掛'
  WHERE settlement_type = '掛売';

  UPDATE public.case_settlements
  SET settlement_type = '3社間決済'
  WHERE settlement_type IN ('ローン', '三社間決済');

  ALTER TABLE public.case_settlements
    ENABLE TRIGGER case_settlements_set_updated_at;
EXCEPTION
  WHEN OTHERS THEN
    -- 失敗時もトリガーを戻す
    BEGIN
      ALTER TABLE public.case_settlements
        ENABLE TRIGGER case_settlements_set_updated_at;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
    RAISE;
END $$;
