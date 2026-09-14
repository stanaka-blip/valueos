-- Phase2: 顧客請求・入金の編集/取消 RPC
-- 新テーブルなし。失敗時は全ROLLBACK。
-- 3社間台帳（finance_receipts / dealer_settlements / supplier_payments /
-- three_party_money_requests）は SELECT（ロック判定）のみ。UPDATE しない。
-- Production 未適用想定。

CREATE OR REPLACE FUNCTION public.replace_invoice(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_date date;
  v_due_date date;
  v_invoice_amount numeric;
  v_subtotal_ex_tax numeric;
  v_tax_amount numeric;
  v_status text;
  v_memo text;
  v_lines jsonb;
  v_line jsonb;
  v_idx int;
  v_sort_order int;
  v_line_kind text;
  v_description text;
  v_quantity numeric;
  v_unit text;
  v_unit_price_ex_tax numeric;
  v_amount_ex_tax numeric;
  v_tax_rate numeric;
  v_line_memo text;
  v_case_product_id uuid;
  v_source_product_id uuid;
  v_source_package_id uuid;
  v_app_code text;
  v_app_message text;
  v_case_id uuid;
  v_original_amount numeric;
  v_confirmed_paid numeric;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:入力内容が正しくありません';
  END IF;

  BEGIN
    v_invoice_id := NULLIF(btrim(payload->>'invoice_id'), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:請求IDが不正です';
  END;
  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:請求IDが不正です';
  END IF;

  SELECT i.case_id, i.invoice_amount
  INTO v_case_id, v_original_amount
  FROM public.invoices i
  WHERE i.id = v_invoice_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'APP:NOT_FOUND:請求が見つかりません';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE id = v_invoice_id AND btrim(COALESCE(status, '')) = '取消'
  ) THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:取消済の請求は編集できません';
  END IF;

  BEGIN
    v_invoice_date := NULLIF(btrim(payload->>'invoice_date'), '')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:請求日が不正です';
  END;
  IF v_invoice_date IS NULL THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:請求日を入力してください';
  END IF;

  BEGIN
    v_due_date := NULLIF(btrim(payload->>'due_date'), '')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:支払期限が不正です';
  END;

  BEGIN
    v_invoice_amount := NULLIF(btrim(payload->>'invoice_amount'), '')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:請求額が不正です';
  END;
  IF v_invoice_amount IS NULL OR v_invoice_amount <= 0 THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:請求額は1円以上で入力してください';
  END IF;

  -- 入金下限: 新請求額 >= 有効な確認済入金合計（status = 入金確認済）
  SELECT COALESCE(SUM(p.payment_amount), 0)
  INTO v_confirmed_paid
  FROM public.payments p
  WHERE p.invoice_id = v_invoice_id
    AND btrim(COALESCE(p.status, '')) = '入金確認済';

  IF v_invoice_amount < v_confirmed_paid THEN
    RAISE EXCEPTION
      'APP:INVALID_INPUT:確認済入金合計（%円）が新しい請求額を超えるため保存できません',
      trim(to_char(v_confirmed_paid, 'FM999999999990'));
  END IF;

  -- 3社間仕切ロック: 確定/支払済がある場合、請求金額変更を禁止（台帳は UPDATE しない）
  IF v_case_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.dealer_settlements ds
       WHERE ds.case_id = v_case_id
         AND btrim(COALESCE(ds.status, '')) IN ('確定', '支払済')
     )
     AND v_invoice_amount IS DISTINCT FROM v_original_amount THEN
    RAISE EXCEPTION
      'APP:INVALID_INPUT:確定済みまたは支払済の仕切があるため、請求額を変更できません';
  END IF;


  BEGIN
    v_subtotal_ex_tax := NULLIF(btrim(payload->>'subtotal_ex_tax'), '')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:税抜金額が不正です';
  END;

  BEGIN
    v_tax_amount := NULLIF(btrim(payload->>'tax_amount'), '')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:税額が不正です';
  END;

  IF v_subtotal_ex_tax IS NOT NULL
     AND v_tax_amount IS NOT NULL
     AND v_invoice_amount IS DISTINCT FROM (v_subtotal_ex_tax + v_tax_amount) THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:請求額と税スナップショットが一致しません';
  END IF;

  v_status := NULLIF(btrim(payload->>'status'), '');
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:ステータスを入力してください';
  END IF;
  IF v_status = '取消' THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:編集画面から取消ステータスには変更できません';
  END IF;

  v_memo := NULLIF(btrim(payload->>'memo'), '');

  v_lines := payload->'lines';
  IF v_lines IS NULL OR jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) < 1 THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:請求明細がありません';
  END IF;

  FOR v_idx IN 0 .. jsonb_array_length(v_lines) - 1 LOOP
    v_line := v_lines->v_idx;
    IF v_line IS NULL OR jsonb_typeof(v_line) <> 'object' THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:請求明細が不正です';
    END IF;

    v_line_kind := NULLIF(btrim(v_line->>'line_kind'), '');
    IF v_line_kind IS NULL OR v_line_kind NOT IN ('product', 'package', 'custom') THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:明細種別が不正です';
    END IF;

    v_description := NULLIF(btrim(v_line->>'description'), '');
    IF v_description IS NULL THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:品名/摘要を入力してください';
    END IF;

    BEGIN
      v_quantity := NULLIF(btrim(v_line->>'quantity'), '')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:数量が不正です';
    END;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:数量は1以上で入力してください';
    END IF;

    BEGIN
      v_unit_price_ex_tax := COALESCE(NULLIF(btrim(v_line->>'unit_price_ex_tax'), '')::numeric, 0);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:単価が不正です';
    END;

    BEGIN
      v_amount_ex_tax := COALESCE(NULLIF(btrim(v_line->>'amount_ex_tax'), '')::numeric, 0);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:明細金額が不正です';
    END;

    BEGIN
      v_tax_rate := COALESCE(NULLIF(btrim(v_line->>'tax_rate'), '')::numeric, 0.10);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:税率が不正です';
    END;
    IF v_tax_rate < 0 OR v_tax_rate > 1 THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:税率が不正です';
    END IF;

    v_unit := NULLIF(btrim(v_line->>'unit'), '');
    v_line_memo := NULLIF(btrim(v_line->>'memo'), '');

    BEGIN
      v_case_product_id := NULLIF(btrim(v_line->>'case_product_id'), '')::uuid;
      v_source_product_id := NULLIF(btrim(v_line->>'source_product_id'), '')::uuid;
      v_source_package_id := NULLIF(btrim(v_line->>'source_package_id'), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:明細の参照IDが不正です';
    END;
  END LOOP;

  UPDATE public.invoices
  SET
    invoice_date = v_invoice_date,
    due_date = v_due_date,
    invoice_amount = v_invoice_amount,
    subtotal_ex_tax = v_subtotal_ex_tax,
    tax_amount = v_tax_amount,
    status = v_status,
    memo = v_memo
  WHERE id = v_invoice_id;

  DELETE FROM public.invoice_line_items WHERE invoice_id = v_invoice_id;

  FOR v_idx IN 0 .. jsonb_array_length(v_lines) - 1 LOOP
    v_line := v_lines->v_idx;
    v_sort_order := COALESCE(NULLIF(btrim(v_line->>'sort_order'), '')::int, v_idx + 1);
    v_line_kind := btrim(v_line->>'line_kind');
    v_description := btrim(v_line->>'description');
    v_quantity := (v_line->>'quantity')::numeric;
    v_unit := NULLIF(btrim(v_line->>'unit'), '');
    v_unit_price_ex_tax := COALESCE((v_line->>'unit_price_ex_tax')::numeric, 0);
    v_amount_ex_tax := COALESCE((v_line->>'amount_ex_tax')::numeric, 0);
    v_tax_rate := COALESCE((v_line->>'tax_rate')::numeric, 0.10);
    v_line_memo := NULLIF(btrim(v_line->>'memo'), '');
    v_case_product_id := NULLIF(btrim(v_line->>'case_product_id'), '')::uuid;
    v_source_product_id := NULLIF(btrim(v_line->>'source_product_id'), '')::uuid;
    v_source_package_id := NULLIF(btrim(v_line->>'source_package_id'), '')::uuid;

    INSERT INTO public.invoice_line_items (
      invoice_id,
      sort_order,
      line_kind,
      description,
      quantity,
      unit,
      unit_price_ex_tax,
      amount_ex_tax,
      tax_rate,
      memo,
      case_product_id,
      source_product_id,
      source_package_id
    ) VALUES (
      v_invoice_id,
      v_sort_order,
      v_line_kind,
      v_description,
      v_quantity,
      v_unit,
      v_unit_price_ex_tax,
      v_amount_ex_tax,
      v_tax_rate,
      v_line_memo,
      v_case_product_id,
      v_source_product_id,
      v_source_package_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', v_invoice_id
  );

EXCEPTION
  WHEN OTHERS THEN
    v_app_code := NULL;
    v_app_message := NULL;
    IF SQLERRM LIKE 'APP:%' THEN
      v_app_code := split_part(SQLERRM, ':', 2);
      v_app_message := NULLIF(
        btrim(substring(SQLERRM from length('APP:' || v_app_code || ':') + 1)),
        ''
      );
    END IF;
    IF v_app_code IS NULL OR v_app_code NOT IN ('INVALID_INPUT', 'NOT_FOUND') THEN
      v_app_code := 'INVOICE_UPDATE_FAILED';
      v_app_message := '請求の更新に失敗しました';
    ELSIF v_app_message IS NULL THEN
      v_app_message := '請求の更新に失敗しました';
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', v_app_code,
      'error_message', v_app_message
    );
END;
$$;

COMMENT ON FUNCTION public.replace_invoice(jsonb) IS
  '請求ヘッダ更新と明細置換を同一トランザクションで行う。確認済入金下限・仕切ロック・取消済ガード付き。失敗時は全ROLLBACK。';

REVOKE ALL ON FUNCTION public.replace_invoice(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.replace_invoice(jsonb) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.replace_invoice(jsonb) TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.replace_invoice(jsonb) TO service_role;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- cancel_invoice
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_invoice(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_invoice_id uuid;
  v_case_id uuid;
  v_status text;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:入力内容が正しくありません';
  END IF;

  BEGIN
    v_invoice_id := NULLIF(btrim(payload->>'invoice_id'), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:請求IDが不正です';
  END;
  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:請求IDが不正です';
  END IF;

  SELECT i.case_id, btrim(COALESCE(i.status, ''))
  INTO v_case_id, v_status
  FROM public.invoices i
  WHERE i.id = v_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APP:NOT_FOUND:請求が見つかりません';
  END IF;

  -- 二重取消: reject（idempotent ではない）
  IF v_status = '取消' THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:この請求は既に取消済みです';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.invoice_id = v_invoice_id
      AND btrim(COALESCE(p.status, '')) <> '取消'
  ) THEN
    RAISE EXCEPTION
      'APP:INVALID_INPUT:この請求には入金履歴があります。先に入金を取消してから、請求を取消してください。';
  END IF;

  IF v_case_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.dealer_settlements ds
       WHERE ds.case_id = v_case_id
         AND btrim(COALESCE(ds.status, '')) IN ('確定', '支払済')
     ) THEN
    RAISE EXCEPTION
      'APP:INVALID_INPUT:確定済みまたは支払済の仕切があるため、請求を取消できません';
  END IF;

  UPDATE public.invoices
  SET status = '取消'
  WHERE id = v_invoice_id;

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', v_invoice_id,
    'status', '取消'
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_invoice(jsonb) IS
  '請求を status=取消 にする。有効入金・確定/支払済仕切がある場合は reject。物理DELETEなし。二重取消は reject。';

REVOKE ALL ON FUNCTION public.cancel_invoice(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.cancel_invoice(jsonb) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.cancel_invoice(jsonb) TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.cancel_invoice(jsonb) TO service_role;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- replace_payment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_payment(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_payment_id uuid;
  v_invoice_id uuid;
  v_payment_status text;
  v_invoice_status text;
  v_invoice_amount numeric;
  v_payment_date date;
  v_payment_amount numeric;
  v_payment_method text;
  v_payer_name text;
  v_bank_account text;
  v_status text;
  v_memo text;
  v_other_active numeric;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:入力内容が正しくありません';
  END IF;

  BEGIN
    v_payment_id := NULLIF(btrim(payload->>'payment_id'), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:入金IDが不正です';
  END;
  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:入金IDが不正です';
  END IF;

  SELECT
    p.invoice_id,
    btrim(COALESCE(p.status, '')),
    p.payment_date,
    p.payment_amount,
    p.payment_method,
    p.payer_name,
    p.bank_account,
    p.memo
  INTO
    v_invoice_id,
    v_payment_status,
    v_payment_date,
    v_payment_amount,
    v_payment_method,
    v_payer_name,
    v_bank_account,
    v_memo
  FROM public.payments p
  WHERE p.id = v_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APP:NOT_FOUND:入金が見つかりません';
  END IF;

  IF v_payment_status = '取消' THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:取消済みの入金は編集できません';
  END IF;

  SELECT btrim(COALESCE(i.status, '')), i.invoice_amount
  INTO v_invoice_status, v_invoice_amount
  FROM public.invoices i
  WHERE i.id = v_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APP:NOT_FOUND:請求が見つかりません';
  END IF;

  IF v_invoice_status = '取消' THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:取消済みの請求に紐づく入金は編集できません';
  END IF;

  IF payload ? 'payment_date' THEN
    BEGIN
      v_payment_date := NULLIF(btrim(payload->>'payment_date'), '')::date;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:入金日が不正です';
    END;
  END IF;
  IF v_payment_date IS NULL THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:入金日を入力してください';
  END IF;

  IF payload ? 'payment_amount' THEN
    BEGIN
      v_payment_amount := NULLIF(btrim(payload->>'payment_amount'), '')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:入金額が不正です';
    END;
  END IF;
  IF v_payment_amount IS NULL OR v_payment_amount <= 0 THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:入金額は1円以上で入力してください';
  END IF;

  IF payload ? 'payment_method' THEN
    v_payment_method := NULLIF(btrim(payload->>'payment_method'), '');
  END IF;
  IF payload ? 'payer_name' THEN
    v_payer_name := NULLIF(btrim(payload->>'payer_name'), '');
  END IF;
  IF payload ? 'bank_account' THEN
    v_bank_account := NULLIF(btrim(payload->>'bank_account'), '');
  END IF;
  IF payload ? 'memo' THEN
    v_memo := NULLIF(btrim(payload->>'memo'), '');
  END IF;

  v_status := v_payment_status;
  IF payload ? 'status' THEN
    v_status := NULLIF(btrim(payload->>'status'), '');
  END IF;
  IF v_status IS NULL OR v_status NOT IN ('確認待ち', '入金確認済', '取消') THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:入金ステータスが不正です';
  END IF;
  IF v_status = '取消' THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:入金の取消は取消ボタン（cancel_payment）から行ってください';
  END IF;

  -- 過入金防止: 他の有効入金（status <> 取消）+ 編集後額 <= 請求額
  SELECT COALESCE(SUM(p.payment_amount), 0)
  INTO v_other_active
  FROM public.payments p
  WHERE p.invoice_id = v_invoice_id
    AND p.id <> v_payment_id
    AND btrim(COALESCE(p.status, '')) <> '取消';

  IF (v_other_active + v_payment_amount) > v_invoice_amount THEN
    RAISE EXCEPTION
      'APP:INVALID_INPUT:有効入金の合計が請求金額を超えます（上限: %円）',
      trim(to_char(v_invoice_amount - v_other_active, 'FM999999999990'));
  END IF;

  UPDATE public.payments
  SET
    payment_date = v_payment_date,
    payment_amount = v_payment_amount,
    payment_method = v_payment_method,
    payer_name = v_payer_name,
    bank_account = v_bank_account,
    status = v_status,
    memo = v_memo
  WHERE id = v_payment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'invoice_id', v_invoice_id,
    'status', v_status
  );
END;
$$;

COMMENT ON FUNCTION public.replace_payment(jsonb) IS
  '顧客入金の更新。過入金防止・取消済ガード付き。3社間台帳は変更しない。';

REVOKE ALL ON FUNCTION public.replace_payment(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.replace_payment(jsonb) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.replace_payment(jsonb) TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.replace_payment(jsonb) TO service_role;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- cancel_payment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_payment(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_payment_id uuid;
  v_invoice_id uuid;
  v_payment_status text;
  v_invoice_status text;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:入力内容が正しくありません';
  END IF;

  BEGIN
    v_payment_id := NULLIF(btrim(payload->>'payment_id'), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:入金IDが不正です';
  END;
  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:入金IDが不正です';
  END IF;

  SELECT p.invoice_id, btrim(COALESCE(p.status, ''))
  INTO v_invoice_id, v_payment_status
  FROM public.payments p
  WHERE p.id = v_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APP:NOT_FOUND:入金が見つかりません';
  END IF;

  -- 二重取消: reject
  IF v_payment_status = '取消' THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:この入金は既に取消済みです';
  END IF;

  SELECT btrim(COALESCE(i.status, ''))
  INTO v_invoice_status
  FROM public.invoices i
  WHERE i.id = v_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APP:NOT_FOUND:請求が見つかりません';
  END IF;

  -- 請求が取消済でも payment 取消は許可（孤立入金の整理用）。通常は請求取消前に実施。
  UPDATE public.payments
  SET status = '取消'
  WHERE id = v_payment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'invoice_id', v_invoice_id,
    'status', '取消',
    'invoice_status', v_invoice_status
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_payment(jsonb) IS
  '顧客入金を status=取消 にする。物理DELETEなし。二重取消は reject。3社間台帳は変更しない。';

REVOKE ALL ON FUNCTION public.cancel_payment(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.cancel_payment(jsonb) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.cancel_payment(jsonb) TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.cancel_payment(jsonb) TO service_role;
  END IF;
END $$;
