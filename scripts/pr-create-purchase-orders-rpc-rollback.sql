-- Rollback SQL for create_purchase_orders
-- 本番では適用しないこと。隔離環境 / 手動ロールバック用。
-- 既存業務データ・他RPCは変更しない。
-- ※ orders_order_no_unique は本番で残す判断があり得るため、明示 DROP はコメントアウト。

DROP FUNCTION IF EXISTS public.create_purchase_orders(jsonb);
DROP TABLE IF EXISTS public.purchase_order_create_requests;

-- DROP INDEX IF EXISTS public.orders_order_no_unique;
