-- SELECT only. 売掛で有効請求 due_date が「最終実納品日の属する月の翌月末」と不一致の案件。
-- UPDATE / DELETE はしない。
-- 業務ルールは computeCreditDates() と同じ（全有効発注が納品済かつ納品日あり、翌月末）。

WITH credit_cases AS (
  SELECT
    c.id AS case_id,
    c.case_no,
    cs.settlement_type
  FROM public.cases c
  JOIN public.case_settlements cs ON cs.case_id = c.id
  WHERE cs.settlement_type IN ('売掛', '掛売')
),
active_orders AS (
  SELECT
    o.case_id,
    o.status,
    o.delivered_date
  FROM public.orders o
  WHERE o.case_id IN (SELECT case_id FROM credit_cases)
    AND COALESCE(btrim(o.status), '') NOT IN ('キャンセル', '取消')
),
delivery_ready AS (
  SELECT
    case_id,
    bool_and(COALESCE(btrim(status), '') = '納品済' AND delivered_date IS NOT NULL) AS all_delivered,
    MAX(delivered_date) AS last_delivered_date
  FROM active_orders
  GROUP BY case_id
),
rule_dates AS (
  SELECT
    case_id,
    last_delivered_date,
    (
      date_trunc('month', last_delivered_date::timestamp) + interval '2 month' - interval '1 day'
    )::date AS rule_due_date
  FROM delivery_ready
  WHERE all_delivered
    AND last_delivered_date IS NOT NULL
),
saved_dues AS (
  SELECT
    i.case_id,
    MIN(i.due_date) AS saved_due_date
  FROM public.invoices i
  WHERE COALESCE(btrim(i.status), '') <> '取消'
    AND i.due_date IS NOT NULL
    AND i.case_id IN (SELECT case_id FROM credit_cases)
  GROUP BY i.case_id
)
SELECT
  cc.case_no,
  cc.case_id,
  rd.last_delivered_date,
  rd.rule_due_date,
  sd.saved_due_date
FROM credit_cases cc
JOIN rule_dates rd ON rd.case_id = cc.case_id
JOIN saved_dues sd ON sd.case_id = cc.case_id
WHERE sd.saved_due_date <> rd.rule_due_date
ORDER BY cc.case_no;
