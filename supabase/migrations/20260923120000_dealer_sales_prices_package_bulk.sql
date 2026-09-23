-- Ver1.1: create_dealer_sales_prices を PACKAGE 対応に拡張
-- - price_target_type: PRODUCT | PACKAGE（省略時 PRODUCT＝後方互換）
-- - PACKAGE: package_id 必須 / product_id 禁止
-- - PRODUCT: product_id 必須 / package_id 禁止
-- - 既存 sales_prices 行の UPDATE/DELETE なし（INSERT のみ）
-- - 販売価格は従来どおり 1円以上（仕入一括の 0円許可とは別契約）
-- - ledger / 冪等は既存 dealer_sales_price_bulk_requests を継続利用
-- - CASCADE / FK 変更なし

CREATE OR REPLACE FUNCTION public.create_dealer_sales_prices(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c_max_items constant int := 200;
  c_max_str_long constant int := 2000;

  v_request_id uuid;
  v_payload_hash text;
  v_existing public.dealer_sales_price_bulk_requests%ROWTYPE;
  v_items jsonb;
  v_row jsonb;

  v_dealer_id uuid;
  v_product_id uuid;
  v_package_id uuid;
  v_price_target_type text;
  v_sales_price numeric;
  v_start_date date;
  v_end_date date;
  v_memo text;
  v_is_active boolean;

  v_idx int;
  v_seen_products uuid[] := ARRAY[]::uuid[];
  v_seen_packages uuid[] := ARRAY[]::uuid[];
  v_created_ids uuid[] := ARRAY[]::uuid[];
  v_price_id uuid;

  v_app_code text;
  v_app_message text;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'FAILED',
      'error_code', 'INVALID_INPUT',
      'error_message', 'payload が不正です'
    );
  END IF;

  BEGIN
    v_request_id := NULLIF(btrim(payload->>'request_id'), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_request_id := NULL;
  END;
  IF v_request_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'FAILED',
      'error_code', 'INVALID_INPUT',
      'error_message', 'request_id が不正です'
    );
  END IF;

  v_payload_hash := md5(payload::text);

  SELECT * INTO v_existing
  FROM public.dealer_sales_price_bulk_requests
  WHERE request_id = v_request_id;

  IF FOUND THEN
    IF v_existing.payload_hash <> v_payload_hash THEN
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'FAILED',
        'request_id', v_request_id,
        'error_code', 'REQUEST_ID_CONFLICT',
        'error_message', '同じ request_id で異なる内容が送られました'
      );
    END IF;
    IF v_existing.status = 'COMPLETED' AND v_existing.response IS NOT NULL THEN
      RETURN v_existing.response || jsonb_build_object('idempotent_replay', true);
    END IF;
    IF v_existing.status = 'FAILED' AND v_existing.response IS NOT NULL THEN
      RETURN v_existing.response || jsonb_build_object('idempotent_replay', true);
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'FAILED',
      'request_id', v_request_id,
      'error_code', 'REQUEST_IN_PROGRESS',
      'error_message', '同じ request_id の処理が進行中です'
    );
  END IF;

  INSERT INTO public.dealer_sales_price_bulk_requests (
    request_id, dealer_id, status, payload_hash
  ) VALUES (
    v_request_id, NULL, 'PROCESSING', v_payload_hash
  );

  BEGIN
    BEGIN
      v_dealer_id := NULLIF(btrim(payload->>'dealer_id'), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:販売店が不正です';
    END;
    IF v_dealer_id IS NULL THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:販売店は必須です';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.dealers d WHERE d.id = v_dealer_id
    ) THEN
      RAISE EXCEPTION 'APP:NOT_FOUND:販売店が見つかりません';
    END IF;

    v_price_target_type := upper(btrim(coalesce(payload->>'price_target_type', 'PRODUCT')));
    IF v_price_target_type NOT IN ('PRODUCT', 'PACKAGE') THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:price_target_type が不正です';
    END IF;

    v_items := payload->'items';
    IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:items は配列である必要があります';
    END IF;
    IF jsonb_array_length(v_items) < 1 THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:登録対象が1件以上必要です';
    END IF;
    IF jsonb_array_length(v_items) > c_max_items THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:登録件数が上限を超えています';
    END IF;

    FOR v_idx IN 0 .. jsonb_array_length(v_items) - 1 LOOP
      v_row := v_items->v_idx;
      IF v_row IS NULL OR jsonb_typeof(v_row) <> 'object' THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:items の行が不正です';
      END IF;

      v_product_id := NULL;
      v_package_id := NULL;

      IF v_price_target_type = 'PACKAGE' THEN
        BEGIN
          v_package_id := NULLIF(btrim(v_row->>'package_id'), '')::uuid;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージが不正です';
        END;
        IF v_package_id IS NULL THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージは必須です';
        END IF;
        IF v_package_id = ANY (v_seen_packages) THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:同じパッケージが複数行に入力されています';
        END IF;
        v_seen_packages := array_append(v_seen_packages, v_package_id);
        IF NULLIF(btrim(coalesce(v_row->>'product_id', '')), '') IS NOT NULL THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:PACKAGE 指定時は product_id を指定できません';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.packages p WHERE p.id = v_package_id
        ) THEN
          RAISE EXCEPTION 'APP:NOT_FOUND:パッケージが見つかりません';
        END IF;
      ELSE
        BEGIN
          v_product_id := NULLIF(btrim(v_row->>'product_id'), '')::uuid;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:商品が不正です';
        END;
        IF v_product_id IS NULL THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:商品は必須です';
        END IF;
        IF v_product_id = ANY (v_seen_products) THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:同じ商品が複数行に入力されています';
        END IF;
        v_seen_products := array_append(v_seen_products, v_product_id);
        IF NULLIF(btrim(coalesce(v_row->>'package_id', '')), '') IS NOT NULL THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:PRODUCT 指定時は package_id を指定できません';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.products p WHERE p.id = v_product_id
        ) THEN
          RAISE EXCEPTION 'APP:NOT_FOUND:商品が見つかりません';
        END IF;
      END IF;

      BEGIN
        v_sales_price := (v_row->>'sales_price')::numeric;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:販売価格が不正です';
      END;
      IF v_sales_price IS NULL OR v_sales_price <= 0 THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:販売価格は1円以上で入力してください';
      END IF;

      v_start_date := NULL;
      IF NULLIF(btrim(v_row->>'start_date'), '') IS NOT NULL THEN
        BEGIN
          v_start_date := btrim(v_row->>'start_date')::date;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:適用開始日が不正です';
        END;
      END IF;

      v_end_date := NULL;
      IF NULLIF(btrim(v_row->>'end_date'), '') IS NOT NULL THEN
        BEGIN
          v_end_date := btrim(v_row->>'end_date')::date;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:適用終了日が不正です';
        END;
      END IF;
      IF v_start_date IS NOT NULL AND v_end_date IS NOT NULL AND v_end_date < v_start_date THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:適用終了日は適用開始日以降に設定してください';
      END IF;

      v_memo := NULLIF(btrim(v_row->>'memo'), '');
      IF v_memo IS NOT NULL AND char_length(v_memo) > c_max_str_long THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:メモが長すぎます';
      END IF;
    END LOOP;

    FOR v_idx IN 0 .. jsonb_array_length(v_items) - 1 LOOP
      v_row := v_items->v_idx;
      v_product_id := NULL;
      v_package_id := NULL;
      IF v_price_target_type = 'PACKAGE' THEN
        v_package_id := btrim(v_row->>'package_id')::uuid;
      ELSE
        v_product_id := btrim(v_row->>'product_id')::uuid;
      END IF;
      v_sales_price := (v_row->>'sales_price')::numeric;
      v_start_date := NULLIF(btrim(v_row->>'start_date'), '')::date;
      v_end_date := NULLIF(btrim(v_row->>'end_date'), '')::date;
      v_memo := NULLIF(btrim(v_row->>'memo'), '');
      BEGIN
        v_is_active := coalesce((v_row->>'is_active')::boolean, true);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:有効フラグが不正です';
      END;

      INSERT INTO public.sales_prices (
        price_target_type,
        product_id,
        package_id,
        dealer_id,
        sales_price,
        start_date,
        end_date,
        memo,
        is_active
      ) VALUES (
        v_price_target_type,
        v_product_id,
        v_package_id,
        v_dealer_id,
        v_sales_price,
        v_start_date,
        v_end_date,
        v_memo,
        v_is_active
      )
      RETURNING id INTO v_price_id;

      v_created_ids := array_append(v_created_ids, v_price_id);
    END LOOP;

    UPDATE public.dealer_sales_price_bulk_requests
    SET status = 'COMPLETED',
        dealer_id = v_dealer_id,
        error_code = NULL,
        error_message = NULL,
        completed_at = clock_timestamp(),
        response = jsonb_build_object(
          'ok', true,
          'status', 'COMPLETED',
          'request_id', v_request_id,
          'dealer_id', v_dealer_id,
          'sales_price_ids', to_jsonb(v_created_ids),
          'item_count', jsonb_array_length(v_items),
          'idempotent_replay', false
        )
    WHERE request_id = v_request_id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'COMPLETED',
      'request_id', v_request_id,
      'dealer_id', v_dealer_id,
      'sales_price_ids', to_jsonb(v_created_ids),
      'item_count', jsonb_array_length(v_items),
      'idempotent_replay', false
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

    IF v_app_code IS NULL OR v_app_code NOT IN (
      'INVALID_INPUT',
      'NOT_FOUND',
      'REQUEST_ID_CONFLICT',
      'REQUEST_IN_PROGRESS',
      'DEALER_SALES_PRICE_BULK_FAILED'
    ) THEN
      v_app_code := 'DEALER_SALES_PRICE_BULK_FAILED';
      v_app_message := '販売価格を一括登録できませんでした';
    ELSIF v_app_message IS NULL THEN
      v_app_message := '販売価格を一括登録できませんでした';
    END IF;

    UPDATE public.dealer_sales_price_bulk_requests
    SET status = 'FAILED',
        dealer_id = NULL,
        error_code = v_app_code,
        error_message = v_app_message,
        completed_at = clock_timestamp(),
        response = jsonb_build_object(
          'ok', false,
          'status', 'FAILED',
          'error_code', v_app_code,
          'error_message', v_app_message
        )
    WHERE request_id = v_request_id;

    RETURN jsonb_build_object(
      'ok', false,
      'status', 'FAILED',
      'request_id', v_request_id,
      'error_code', v_app_code,
      'error_message', v_app_message,
      'idempotent_replay', false
    );
  END;
END;
$$;

COMMENT ON FUNCTION public.create_dealer_sales_prices(jsonb) IS
  '販売店1社に対する複数 PRODUCT/PACKAGE 販売価格を1トランザクションでINSERT。既存行非更新。冪等ledger付き。';

REVOKE ALL ON FUNCTION public.create_dealer_sales_prices(jsonb) FROM PUBLIC;
DO $$
BEGIN
  BEGIN
    REVOKE ALL ON FUNCTION public.create_dealer_sales_prices(jsonb) FROM anon;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  BEGIN
    REVOKE ALL ON FUNCTION public.create_dealer_sales_prices(jsonb) FROM authenticated;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  BEGIN
    REVOKE ALL ON FUNCTION public.create_dealer_sales_prices(jsonb) FROM service_role;
    GRANT EXECUTE ON FUNCTION public.create_dealer_sales_prices(jsonb) TO service_role;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END $$;
