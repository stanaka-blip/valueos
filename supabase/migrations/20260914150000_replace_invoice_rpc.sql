-- 請求編集: invoices ヘッダ更新 + invoice_line_items 置換を 1 トランザクションで行う。
-- 新テーブルなし。失敗時は全ROLLBACK（ヘッダと明細がズレない）。
-- 業務ガード（入金下限・仕切ロック）はアプリ側で実施し、本 RPC は原子性を担保する。

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

  PERFORM 1 FROM public.invoices WHERE id = v_invoice_id FOR UPDATE;
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
  '請求ヘッダ更新と明細置換を同一トランザクションで行う。失敗時は全ROLLBACK。取消済は編集不可。';

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
