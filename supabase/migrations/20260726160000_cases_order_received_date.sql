-- PR27: 顧客受注日（売上計上基準）
-- 意味: 顧客が当社へ商品・工事を正式に発注した日
-- ※ 仕入先発注日 orders.order_date とは別物

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS order_received_date date;

COMMENT ON COLUMN public.cases.order_received_date IS
  '顧客受注日（売上計上基準）。仕入発注日 orders.order_date とは異なる。';

-- 既存データ暫定バックフィル: created_at の日付部分
UPDATE public.cases
SET order_received_date = (created_at AT TIME ZONE 'Asia/Tokyo')::date
WHERE order_received_date IS NULL
  AND created_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS cases_order_received_date_idx
  ON public.cases (order_received_date);
