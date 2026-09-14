-- Phase2 監査SQL（SELECT only）
-- Production では実行しない。ローカル / staging での不整合確認用。

-- ---------------------------------------------------------------------------
-- A. 取消請求に有効 payment が残っている不整合
-- ---------------------------------------------------------------------------
SELECT
  i.id AS invoice_id,
  i.invoice_no,
  i.status AS invoice_status,
  i.invoice_amount,
  p.id AS payment_id,
  p.payment_amount,
  p.status AS payment_status,
  p.payment_date
FROM public.invoices i
JOIN public.payments p
  ON p.invoice_id = i.id
WHERE btrim(COALESCE(i.status, '')) = '取消'
  AND btrim(COALESCE(p.status, '')) <> '取消'
ORDER BY i.id, p.payment_date;

-- ---------------------------------------------------------------------------
-- B. 有効 payment 合計 > invoice_amount の過入金不整合
-- ---------------------------------------------------------------------------
SELECT
  i.id AS invoice_id,
  i.invoice_no,
  i.status AS invoice_status,
  i.invoice_amount,
  SUM(p.payment_amount) AS active_payments_sum,
  SUM(p.payment_amount) - i.invoice_amount AS overpay_amount
FROM public.invoices i
JOIN public.payments p
  ON p.invoice_id = i.id
WHERE btrim(COALESCE(i.status, '')) <> '取消'
  AND btrim(COALESCE(p.status, '')) <> '取消'
GROUP BY i.id, i.invoice_no, i.status, i.invoice_amount
HAVING SUM(p.payment_amount) > i.invoice_amount
ORDER BY overpay_amount DESC;

-- ---------------------------------------------------------------------------
-- C. 3社間で確定/支払済仕切がある案件の請求一覧
--     （金額変更の疑いを人手確認するための候補抽出。
--      履歴テーブルが無いため「変更が疑われる」厳密証明は不可。
--      ロック対象となり得る請求を一覧する。）
-- ---------------------------------------------------------------------------
SELECT
  c.id AS case_id,
  c.case_no,
  ds.id AS dealer_settlement_id,
  ds.status AS dealer_settlement_status,
  ds.payout_amount,
  i.id AS invoice_id,
  i.invoice_no,
  i.status AS invoice_status,
  i.invoice_amount,
  i.invoice_date
FROM public.dealer_settlements ds
JOIN public.cases c
  ON c.id = ds.case_id
JOIN public.invoices i
  ON i.case_id = c.id
WHERE btrim(COALESCE(ds.status, '')) IN ('確定', '支払済')
  AND btrim(COALESCE(i.status, '')) <> '取消'
ORDER BY c.case_no, i.invoice_date;
