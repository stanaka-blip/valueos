-- 発注編集: 自由入力明細（[VE_CUSTOM]）を product_id なしで保存可能にする。
-- order_items スキーマ変更なし。replace_purchase_order のバリデーションのみ緩和。

CREATE OR REPLACE FUNCTION public.replace_purchase_order(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order_id uuid;
  v_status text;
  v_memo text;
  v_expected_delivery_date date;
  v_delivered_date date;
  v_items jsonb;
  v_item jsonb;
  v_item_idx int;
  v_existing record;
  v_item_id uuid;
  v_product_id uuid;
  v_case_product_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_amount numeric;
  v_item_memo text;
  v_sort_order int;
  v_order_amount numeric := 0;
  v_found int;
  v_app_code text;
  v_app_message text;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:入力内容が正しくありません';
  END IF;

  BEGIN
    v_order_id := NULLIF(btrim(payload->>'order_id'), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:発注IDが不正です';
  END;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:発注IDが不正です';
  END IF;

  PERFORM 1 FROM public.orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'APP:NOT_FOUND:発注が見つかりません';
  END IF;

  v_status := NULLIF(btrim(payload->>'status'), '');
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:発注ステータスを入力してください';
  END IF;

  v_memo := NULLIF(btrim(payload->>'memo'), '');

  BEGIN
    v_expected_delivery_date := NULLIF(btrim(payload->>'expected_delivery_date'), '')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:納品予定日が不正です';
  END;

  BEGIN
    v_delivered_date := NULLIF(btrim(payload->>'delivered_date'), '')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:実納品日が不正です';
  END;

  v_items := payload->'items';
  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) < 1 THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:発注明細がありません';
  END IF;

  FOR v_existing IN
    SELECT id, memo
    FROM public.order_items
    WHERE order_id = v_order_id
      AND (
        COALESCE(memo, '') LIKE '[VE_PKG_AMT]%'
        OR COALESCE(memo, '') LIKE '[VE_PKG_COMP]%'
      )
  LOOP
    v_found := 0;
    FOR v_item_idx IN 0 .. jsonb_array_length(v_items) - 1 LOOP
      IF NULLIF(btrim(v_items->v_item_idx->>'id'), '') = v_existing.id::text THEN
        v_found := 1;
        IF btrim(COALESCE(v_items->v_item_idx->>'memo', '')) IS DISTINCT FROM btrim(COALESCE(v_existing.memo, '')) THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージ明細の内部情報は変更できません。';
        END IF;
      END IF;
    END LOOP;
    IF v_found = 0 THEN
      IF COALESCE(v_existing.memo, '') LIKE '[VE_PKG_AMT]%' THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージ金額行は削除できません。';
      END IF;
      RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージ構成行は削除できません。';
    END IF;
  END LOOP;

  FOR v_item_idx IN 0 .. jsonb_array_length(v_items) - 1 LOOP
    v_item := v_items->v_item_idx;
    IF v_item IS NULL OR jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:発注明細が不正です';
    END IF;

    v_item_id := NULL;
    BEGIN
      v_item_id := NULLIF(btrim(v_item->>'id'), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:発注明細が不正です';
    END;

    v_item_memo := NULLIF(btrim(v_item->>'memo'), '');
    IF v_item_id IS NULL AND (
      COALESCE(v_item_memo, '') LIKE '[VE_PKG_AMT]%'
      OR COALESCE(v_item_memo, '') LIKE '[VE_PKG_COMP]%'
    ) THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージ明細は新規追加できません。';
    END IF;

    BEGIN
      v_quantity := (v_item->>'quantity')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:数量は1以上で入力してください。';
    END;
    IF v_quantity IS NULL OR v_quantity <> trunc(v_quantity) OR v_quantity < 1 THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:数量は1以上で入力してください。';
    END IF;

    BEGIN
      v_unit_price := COALESCE((v_item->>'unit_price')::numeric, 0);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:単価は0以上で入力してください。';
    END;
    IF v_unit_price < 0 THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:単価は0以上で入力してください。';
    END IF;

    IF COALESCE(v_item_memo, '') LIKE '[VE_PKG_COMP]%' THEN
      v_unit_price := 0;
      v_amount := 0;
    ELSE
      v_amount := round(v_quantity * v_unit_price);
    END IF;

    IF NULLIF(btrim(v_item->>'product_id'), '') IS NULL THEN
      IF COALESCE(v_item_memo, '') NOT LIKE '[VE_CUSTOM]|%' THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:追加した明細はメーカー・製品/型番を選択してください。';
      END IF;
      IF NULLIF(btrim(split_part(COALESCE(v_item_memo, ''), '|', 3)), '') IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:自由入力明細の明細名を入力してください。';
      END IF;
    END IF;

    v_order_amount := v_order_amount + v_amount;
  END LOOP;

  UPDATE public.orders
  SET
    expected_delivery_date = v_expected_delivery_date,
    delivered_date = v_delivered_date,
    status = v_status,
    memo = v_memo,
    order_amount = v_order_amount
  WHERE id = v_order_id;

  DELETE FROM public.order_items WHERE order_id = v_order_id;

  FOR v_item_idx IN 0 .. jsonb_array_length(v_items) - 1 LOOP
    v_item := v_items->v_item_idx;
    v_item_memo := NULLIF(btrim(v_item->>'memo'), '');
    BEGIN
      v_product_id := NULLIF(btrim(v_item->>'product_id'), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:商品が不正です';
    END;
    BEGIN
      v_case_product_id := NULLIF(btrim(v_item->>'case_product_id'), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:案件商品参照が不正です';
    END;
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_price := COALESCE((v_item->>'unit_price')::numeric, 0);
    IF COALESCE(v_item_memo, '') LIKE '[VE_PKG_COMP]%' THEN
      v_unit_price := 0;
      v_amount := 0;
    ELSE
      v_amount := round(v_quantity * v_unit_price);
    END IF;
    BEGIN
      v_sort_order := COALESCE((v_item->>'sort_order')::int, v_item_idx);
    EXCEPTION WHEN OTHERS THEN
      v_sort_order := v_item_idx;
    END;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      case_product_id,
      quantity,
      unit_price,
      amount,
      memo,
      sort_order
    ) VALUES (
      v_order_id,
      v_product_id,
      v_case_product_id,
      v_quantity,
      v_unit_price,
      v_amount,
      v_item_memo,
      v_sort_order
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_amount', v_order_amount,
    'item_count', jsonb_array_length(v_items)
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
      v_app_code := 'ORDER_UPDATE_FAILED';
      v_app_message := '発注の更新に失敗しました';
    ELSIF v_app_message IS NULL THEN
      v_app_message := '発注の更新に失敗しました';
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', v_app_code,
      'error_message', v_app_message
    );
END;
$$;

COMMENT ON FUNCTION public.replace_purchase_order(jsonb) IS
  '発注ヘッダ更新と明細置換を同一トランザクションで行う。失敗時は全ROLLBACK。パッケージAMT/COMP行は削除不可。COMP金額は0。[VE_CUSTOM] は product_id なし可。';

REVOKE ALL ON FUNCTION public.replace_purchase_order(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.replace_purchase_order(jsonb) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.replace_purchase_order(jsonb) TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.replace_purchase_order(jsonb) TO service_role;
  END IF;
END $$;
