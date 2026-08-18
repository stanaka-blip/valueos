-- 発注の納品予定日と実納品日は別フィールド。
-- delivered_date は既にあるため列追加・バックフィルはしない。
-- created_at / updated_at を納品日として扱わない（アプリ側も同様）。
-- 既存の delivered_date 値は変更しない。

COMMENT ON COLUMN public.orders.expected_delivery_date IS
  '納品予定日。実納品日(delivered_date)とは別。created_at / updated_at を納品日として使わない。';

COMMENT ON COLUMN public.orders.delivered_date IS
  '実納品日。納品予定日(expected_delivery_date)とは別。未入力は NULL。created_at / updated_at を納品日として使わない。ステータスが納品済でも自動補完しない。';
