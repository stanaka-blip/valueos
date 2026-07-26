-- Ver1.0: case_products に価格確定時刻スナップショット列を追加
-- Additive only. 既存行は NULL のまま（バックフィルしない）。

ALTER TABLE public.case_products
  ADD COLUMN IF NOT EXISTS price_fetched_at timestamptz;

COMMENT ON COLUMN public.case_products.price_fetched_at IS
  '案件登録時に販売/仕入価格を確定した時刻（timestamptz）。legacy行はNULL。';
