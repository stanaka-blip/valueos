-- 現場改善 ⑧⑩
-- - products.model_no に DB UNIQUE は元々無し。RPC の重複拒否を解除
-- - create_supplier_purchase_prices を PACKAGE + 0円対応に拡張
-- - schema / 新テーブル / backfill なし。Production 適用は別途判断

CREATE OR REPLACE FUNCTION public.create_product_setup(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c_max_purchase constant int := 50;
  c_max_sales constant int := 100;
  c_max_str_short constant int := 200;
  c_max_str_long constant int := 2000;

  v_request_id uuid;
  v_payload_hash text;
  v_existing public.product_setup_requests%ROWTYPE;
  v_product jsonb;
  v_purchase_prices jsonb;
  v_sales_prices jsonb;
  v_row jsonb;

  v_manufacturer_id uuid;
  v_series_id uuid;
  v_default_supplier_id uuid;
  v_category text;
  v_model_no text;
  v_name text;
  v_capacity text;
  v_unit text;
  v_memo text;
  v_is_active boolean;

  v_product_id uuid;
  v_supplier_id uuid;
  v_dealer_id uuid;
  v_purchase_price numeric;
  v_sales_price numeric;
  v_start_date date;
  v_end_date date;
  v_price_memo text;
  v_price_active boolean;

  v_idx int;
  v_seen_suppliers uuid[] := ARRAY[]::uuid[];
  v_seen_dealers uuid[] := ARRAY[]::uuid[];
  v_purchase_ids uuid[] := ARRAY[]::uuid[];
  v_sales_ids uuid[] := ARRAY[]::uuid[];
  v_purchase_id uuid;
  v_sales_id uuid;

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
  FROM public.product_setup_requests
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

  INSERT INTO public.product_setup_requests (
    request_id, product_id, status, payload_hash
  ) VALUES (
    v_request_id, NULL, 'PROCESSING', v_payload_hash
  );

  BEGIN
    v_product := payload->'product';
    IF v_product IS NULL OR jsonb_typeof(v_product) <> 'object' THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:商品情報が必要です';
    END IF;

    BEGIN
      v_manufacturer_id := NULLIF(btrim(v_product->>'manufacturer_id'), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:メーカーが不正です';
    END;
    IF v_manufacturer_id IS NULL THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:メーカーは必須です';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.manufacturers m WHERE m.id = v_manufacturer_id
    ) THEN
      RAISE EXCEPTION 'APP:NOT_FOUND:メーカーが見つかりません';
    END IF;

    v_series_id := NULL;
    IF NULLIF(btrim(v_product->>'series_id'), '') IS NOT NULL THEN
      BEGIN
        v_series_id := btrim(v_product->>'series_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:シリーズが不正です';
      END;
      IF NOT EXISTS (
        SELECT 1
        FROM public.product_series s
        WHERE s.id = v_series_id
          AND s.manufacturer_id = v_manufacturer_id
      ) THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:シリーズがメーカーと一致しません';
      END IF;
    END IF;

    BEGIN
      v_default_supplier_id := NULLIF(btrim(v_product->>'default_supplier_id'), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:標準仕入先が不正です';
    END;
    IF v_default_supplier_id IS NULL THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:標準仕入先は必須です';
    END IF;

    v_name := NULLIF(btrim(v_product->>'name'), '');
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:商品名は必須です';
    END IF;
    IF char_length(v_name) > c_max_str_short THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:商品名が長すぎます';
    END IF;

    v_model_no := NULLIF(btrim(v_product->>'model_no'), '');
    IF v_model_no IS NULL THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:型番は必須です';
    END IF;
    IF char_length(v_model_no) > c_max_str_short THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:型番が長すぎます';
    END IF;

    v_category := NULLIF(btrim(v_product->>'category'), '');
    IF v_category IS NOT NULL AND char_length(v_category) > c_max_str_short THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:カテゴリが長すぎます';
    END IF;

    v_capacity := NULLIF(btrim(v_product->>'capacity'), '');
    IF v_capacity IS NOT NULL AND char_length(v_capacity) > c_max_str_short THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:容量が長すぎます';
    END IF;

    v_unit := NULLIF(btrim(v_product->>'unit'), '');
    IF v_unit IS NOT NULL AND char_length(v_unit) > c_max_str_short THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:単位が長すぎます';
    END IF;

    v_memo := NULLIF(btrim(v_product->>'memo'), '');
    IF v_memo IS NOT NULL AND char_length(v_memo) > c_max_str_long THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:メモが長すぎます';
    END IF;

    BEGIN
      v_is_active := coalesce((v_product->>'is_active')::boolean, true);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:有効フラグが不正です';
    END;
    -- 同一型番の複数商品登録を許可（現場改善⑧）

    v_purchase_prices := payload->'purchase_prices';
    IF v_purchase_prices IS NULL OR jsonb_typeof(v_purchase_prices) <> 'array' THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:仕入価格は配列である必要があります';
    END IF;
    IF jsonb_array_length(v_purchase_prices) < 1 THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:仕入価格は1件以上必要です';
    END IF;
    IF jsonb_array_length(v_purchase_prices) > c_max_purchase THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:仕入価格の件数が上限を超えています';
    END IF;

    v_sales_prices := payload->'sales_prices';
    IF v_sales_prices IS NULL THEN
      v_sales_prices := '[]'::jsonb;
    END IF;
    IF jsonb_typeof(v_sales_prices) <> 'array' THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:販売価格は配列である必要があります';
    END IF;
    IF jsonb_array_length(v_sales_prices) > c_max_sales THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:販売価格の件数が上限を超えています';
    END IF;

    -- 仕入価格の事前検証（supplier 一意・標準仕入先包含）
    FOR v_idx IN 0 .. jsonb_array_length(v_purchase_prices) - 1 LOOP
      v_row := v_purchase_prices->v_idx;
      IF v_row IS NULL OR jsonb_typeof(v_row) <> 'object' THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:仕入価格の行が不正です';
      END IF;

      BEGIN
        v_supplier_id := NULLIF(btrim(v_row->>'supplier_id'), '')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:仕入先が不正です';
      END;
      IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:仕入先は必須です';
      END IF;
      IF v_supplier_id = ANY (v_seen_suppliers) THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:同じ仕入先が複数行に入力されています';
      END IF;
      v_seen_suppliers := array_append(v_seen_suppliers, v_supplier_id);

      IF NOT EXISTS (
        SELECT 1 FROM public.suppliers s WHERE s.id = v_supplier_id
      ) THEN
        RAISE EXCEPTION 'APP:NOT_FOUND:仕入先が見つかりません';
      END IF;

      BEGIN
        v_purchase_price := (v_row->>'purchase_price')::numeric;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:仕入価格が不正です';
      END;
      IF v_purchase_price IS NULL OR v_purchase_price <= 0 THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:仕入価格は1円以上で入力してください';
      END IF;

      v_start_date := NULL;
      IF NULLIF(btrim(v_row->>'start_date'), '') IS NOT NULL THEN
        BEGIN
          v_start_date := btrim(v_row->>'start_date')::date;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:仕入価格の適用開始日が不正です';
        END;
      END IF;

      v_end_date := NULL;
      IF NULLIF(btrim(v_row->>'end_date'), '') IS NOT NULL THEN
        BEGIN
          v_end_date := btrim(v_row->>'end_date')::date;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:仕入価格の適用終了日が不正です';
        END;
      END IF;
      IF v_start_date IS NOT NULL AND v_end_date IS NOT NULL AND v_end_date < v_start_date THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:仕入価格の適用終了日は適用開始日以降に設定してください';
      END IF;
    END LOOP;

    IF NOT (v_default_supplier_id = ANY (v_seen_suppliers)) THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:標準仕入先は仕入価格に含まれる仕入先から選んでください';
    END IF;

    -- 販売価格の事前検証（dealer 一意）
    FOR v_idx IN 0 .. jsonb_array_length(v_sales_prices) - 1 LOOP
      v_row := v_sales_prices->v_idx;
      IF v_row IS NULL OR jsonb_typeof(v_row) <> 'object' THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:販売価格の行が不正です';
      END IF;

      BEGIN
        v_dealer_id := NULLIF(btrim(v_row->>'dealer_id'), '')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:販売店が不正です';
      END;
      IF v_dealer_id IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:販売店は必須です';
      END IF;
      IF v_dealer_id = ANY (v_seen_dealers) THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:同じ販売店が複数行に入力されています';
      END IF;
      v_seen_dealers := array_append(v_seen_dealers, v_dealer_id);

      IF NOT EXISTS (
        SELECT 1 FROM public.dealers d WHERE d.id = v_dealer_id
      ) THEN
        RAISE EXCEPTION 'APP:NOT_FOUND:販売店が見つかりません';
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
          RAISE EXCEPTION 'APP:INVALID_INPUT:販売価格の適用開始日が不正です';
        END;
      END IF;

      v_end_date := NULL;
      IF NULLIF(btrim(v_row->>'end_date'), '') IS NOT NULL THEN
        BEGIN
          v_end_date := btrim(v_row->>'end_date')::date;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:販売価格の適用終了日が不正です';
        END;
      END IF;
      IF v_start_date IS NOT NULL AND v_end_date IS NOT NULL AND v_end_date < v_start_date THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:販売価格の適用終了日は適用開始日以降に設定してください';
      END IF;
    END LOOP;

    -- products.is_active は環境により text / boolean があり得るため text 表現で入れる
    INSERT INTO public.products (
      manufacturer_id,
      series_id,
      category,
      model_no,
      name,
      capacity,
      unit,
      memo,
      is_active,
      default_supplier_id
    ) VALUES (
      v_manufacturer_id,
      v_series_id,
      v_category,
      v_model_no,
      v_name,
      v_capacity,
      v_unit,
      v_memo,
      CASE WHEN v_is_active THEN 'true' ELSE 'false' END,
      v_default_supplier_id
    )
    RETURNING id INTO v_product_id;

    FOR v_idx IN 0 .. jsonb_array_length(v_purchase_prices) - 1 LOOP
      v_row := v_purchase_prices->v_idx;
      v_supplier_id := btrim(v_row->>'supplier_id')::uuid;
      v_purchase_price := (v_row->>'purchase_price')::numeric;
      v_start_date := NULLIF(btrim(v_row->>'start_date'), '')::date;
      v_end_date := NULLIF(btrim(v_row->>'end_date'), '')::date;
      v_price_memo := NULLIF(btrim(v_row->>'memo'), '');
      BEGIN
        v_price_active := coalesce((v_row->>'is_active')::boolean, true);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:仕入価格の有効フラグが不正です';
      END;

      INSERT INTO public.purchase_prices (
        price_target_type,
        product_id,
        package_id,
        supplier_id,
        purchase_price,
        start_date,
        end_date,
        memo,
        is_active
      ) VALUES (
        'PRODUCT',
        v_product_id,
        NULL,
        v_supplier_id,
        v_purchase_price,
        v_start_date,
        v_end_date,
        v_price_memo,
        v_price_active
      )
      RETURNING id INTO v_purchase_id;

      v_purchase_ids := array_append(v_purchase_ids, v_purchase_id);
    END LOOP;

    FOR v_idx IN 0 .. jsonb_array_length(v_sales_prices) - 1 LOOP
      v_row := v_sales_prices->v_idx;
      v_dealer_id := btrim(v_row->>'dealer_id')::uuid;
      v_sales_price := (v_row->>'sales_price')::numeric;
      v_start_date := NULLIF(btrim(v_row->>'start_date'), '')::date;
      v_end_date := NULLIF(btrim(v_row->>'end_date'), '')::date;
      v_price_memo := NULLIF(btrim(v_row->>'memo'), '');
      BEGIN
        v_price_active := coalesce((v_row->>'is_active')::boolean, true);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:販売価格の有効フラグが不正です';
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
        'PRODUCT',
        v_product_id,
        NULL,
        v_dealer_id,
        v_sales_price,
        v_start_date,
        v_end_date,
        v_price_memo,
        v_price_active
      )
      RETURNING id INTO v_sales_id;

      v_sales_ids := array_append(v_sales_ids, v_sales_id);
    END LOOP;

    UPDATE public.product_setup_requests
    SET status = 'COMPLETED',
        product_id = v_product_id,
        error_code = NULL,
        error_message = NULL,
        completed_at = clock_timestamp(),
        response = jsonb_build_object(
          'ok', true,
          'status', 'COMPLETED',
          'request_id', v_request_id,
          'product_id', v_product_id,
          'purchase_price_ids', to_jsonb(v_purchase_ids),
          'sales_price_ids', to_jsonb(v_sales_ids),
          'idempotent_replay', false
        )
    WHERE request_id = v_request_id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'COMPLETED',
      'request_id', v_request_id,
      'product_id', v_product_id,
      'purchase_price_ids', to_jsonb(v_purchase_ids),
      'sales_price_ids', to_jsonb(v_sales_ids),
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
      'DUPLICATE_PRODUCT',
      'REQUEST_ID_CONFLICT',
      'REQUEST_IN_PROGRESS',
      'PRODUCT_SETUP_FAILED'
    ) THEN
      v_app_code := 'PRODUCT_SETUP_FAILED';
      v_app_message := '商品セットアップを登録できませんでした';
    ELSIF v_app_message IS NULL THEN
      v_app_message := '商品セットアップを登録できませんでした';
    END IF;

    UPDATE public.product_setup_requests
    SET status = 'FAILED',
        product_id = NULL,
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

    -- 本体の INSERT は同一サブトランザクション内なので自動ロールバックされる。
    -- ledger の FAILED 更新だけ残すため、ここでは再 RAISE しない。
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

CREATE OR REPLACE FUNCTION public.create_product_bulk_setup(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c_max_products constant int := 50;
  c_max_str_short constant int := 200;
  c_max_str_long constant int := 2000;

  v_request_id uuid;
  v_payload_hash text;
  v_existing public.product_bulk_setup_requests%ROWTYPE;
  v_products jsonb;
  v_row jsonb;

  v_manufacturer_id uuid;
  v_series_id uuid;
  v_category text;
  v_product_id uuid;
  v_model_no text;
  v_name text;
  v_capacity text;
  v_unit text;
  v_memo text;
  v_is_active boolean;
  v_active_text text;

  v_idx int;
  v_row_no int;
  v_seen_models text[] := ARRAY[]::text[];
  v_model_key text;
  v_created_ids uuid[] := ARRAY[]::uuid[];

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
  FROM public.product_bulk_setup_requests
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

  INSERT INTO public.product_bulk_setup_requests (
    request_id, manufacturer_id, status, payload_hash
  ) VALUES (
    v_request_id, NULL, 'PROCESSING', v_payload_hash
  );

  BEGIN
    BEGIN
      v_manufacturer_id := NULLIF(btrim(payload->>'manufacturer_id'), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:メーカーが不正です';
    END;
    IF v_manufacturer_id IS NULL THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:メーカーは必須です';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.manufacturers m WHERE m.id = v_manufacturer_id
    ) THEN
      RAISE EXCEPTION 'APP:NOT_FOUND:メーカーが見つかりません';
    END IF;

    v_category := NULLIF(btrim(payload->>'category'), '');
    IF v_category IS NOT NULL AND char_length(v_category) > c_max_str_short THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:カテゴリーが長すぎます';
    END IF;

    v_series_id := NULL;
    IF NULLIF(btrim(payload->>'series_id'), '') IS NOT NULL THEN
      BEGIN
        v_series_id := btrim(payload->>'series_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:シリーズが不正です';
      END;
      IF NOT EXISTS (
        SELECT 1
        FROM public.product_series s
        WHERE s.id = v_series_id
          AND s.manufacturer_id = v_manufacturer_id
      ) THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:シリーズがメーカーと一致しません';
      END IF;
    END IF;

    v_products := payload->'products';
    IF v_products IS NULL OR jsonb_typeof(v_products) <> 'array' THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:products は配列である必要があります';
    END IF;
    IF jsonb_array_length(v_products) < 1 THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:商品が1件以上必要です';
    END IF;
    IF jsonb_array_length(v_products) > c_max_products THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:商品件数が上限を超えています';
    END IF;

    -- validate all rows first
    FOR v_idx IN 0 .. jsonb_array_length(v_products) - 1 LOOP
      v_row_no := v_idx + 1;
      v_row := v_products->v_idx;
      IF v_row IS NULL OR jsonb_typeof(v_row) <> 'object' THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:行%: 行が不正です', v_row_no;
      END IF;

      v_model_no := NULLIF(btrim(v_row->>'model_no'), '');
      IF v_model_no IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:行%: 型番は必須です', v_row_no;
      END IF;
      IF char_length(v_model_no) > c_max_str_short THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:行%: 型番が長すぎます', v_row_no;
      END IF;
      -- 同一型番の複数商品登録を許可（現場改善⑧）

      v_name := NULLIF(btrim(v_row->>'name'), '');
      IF v_name IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:行%: 商品名は必須です', v_row_no;
      END IF;
      IF char_length(v_name) > c_max_str_short THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:行%: 商品名が長すぎます', v_row_no;
      END IF;

      v_capacity := NULLIF(btrim(v_row->>'capacity'), '');
      IF v_capacity IS NOT NULL AND char_length(v_capacity) > c_max_str_short THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:行%: 容量が長すぎます', v_row_no;
      END IF;

      v_unit := NULLIF(btrim(v_row->>'unit'), '');
      IF v_unit IS NOT NULL AND char_length(v_unit) > c_max_str_short THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:行%: 単位が長すぎます', v_row_no;
      END IF;

      v_memo := NULLIF(btrim(v_row->>'memo'), '');
      IF v_memo IS NOT NULL AND char_length(v_memo) > c_max_str_long THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:行%: メモが長すぎます', v_row_no;
      END IF;

      BEGIN
        v_is_active := coalesce((v_row->>'is_active')::boolean, true);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:行%: 有効フラグが不正です', v_row_no;
      END;
    END LOOP;

    -- insert all products (same transaction; failure rolls back inserts)
    FOR v_idx IN 0 .. jsonb_array_length(v_products) - 1 LOOP
      v_row_no := v_idx + 1;
      v_row := v_products->v_idx;
      v_model_no := btrim(v_row->>'model_no');
      v_name := btrim(v_row->>'name');
      v_capacity := NULLIF(btrim(v_row->>'capacity'), '');
      v_unit := NULLIF(btrim(v_row->>'unit'), '');
      v_memo := NULLIF(btrim(v_row->>'memo'), '');
      BEGIN
        v_is_active := coalesce((v_row->>'is_active')::boolean, true);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:行%: 有効フラグが不正です', v_row_no;
      END;
      v_active_text := CASE WHEN v_is_active THEN 'true' ELSE 'false' END;

      INSERT INTO public.products (
        manufacturer_id,
        series_id,
        category,
        model_no,
        name,
        capacity,
        unit,
        memo,
        is_active
      ) VALUES (
        v_manufacturer_id,
        v_series_id,
        v_category,
        v_model_no,
        v_name,
        v_capacity,
        v_unit,
        v_memo,
        v_active_text
      )
      RETURNING id INTO v_product_id;

      v_created_ids := array_append(v_created_ids, v_product_id);
    END LOOP;

    UPDATE public.product_bulk_setup_requests
    SET status = 'COMPLETED',
        manufacturer_id = v_manufacturer_id,
        error_code = NULL,
        error_message = NULL,
        completed_at = clock_timestamp(),
        response = jsonb_build_object(
          'ok', true,
          'status', 'COMPLETED',
          'request_id', v_request_id,
          'manufacturer_id', v_manufacturer_id,
          'series_id', v_series_id,
          'category', v_category,
          'product_ids', to_jsonb(v_created_ids),
          'product_count', jsonb_array_length(v_products),
          'idempotent_replay', false
        )
    WHERE request_id = v_request_id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'COMPLETED',
      'request_id', v_request_id,
      'manufacturer_id', v_manufacturer_id,
      'series_id', v_series_id,
      'category', v_category,
      'product_ids', to_jsonb(v_created_ids),
      'product_count', jsonb_array_length(v_products),
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
      'DUPLICATE_PRODUCT',
      'REQUEST_ID_CONFLICT',
      'REQUEST_IN_PROGRESS',
      'PRODUCT_BULK_SETUP_FAILED'
    ) THEN
      v_app_code := 'PRODUCT_BULK_SETUP_FAILED';
      v_app_message := '商品を一括登録できませんでした';
    ELSIF v_app_message IS NULL THEN
      v_app_message := '商品を一括登録できませんでした';
    END IF;

    UPDATE public.product_bulk_setup_requests
    SET status = 'FAILED',
        manufacturer_id = NULL,
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

CREATE OR REPLACE FUNCTION public.create_supplier_purchase_prices(payload jsonb)
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
  v_existing public.supplier_purchase_price_bulk_requests%ROWTYPE;
  v_items jsonb;
  v_row jsonb;

  v_supplier_id uuid;
  v_product_id uuid;
  v_package_id uuid;
  v_price_target_type text;
  v_purchase_price numeric;
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
  FROM public.supplier_purchase_price_bulk_requests
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

  INSERT INTO public.supplier_purchase_price_bulk_requests (
    request_id, supplier_id, status, payload_hash
  ) VALUES (
    v_request_id, NULL, 'PROCESSING', v_payload_hash
  );

  BEGIN
    BEGIN
      v_supplier_id := NULLIF(btrim(payload->>'supplier_id'), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:仕入先が不正です';
    END;
    IF v_supplier_id IS NULL THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:仕入先は必須です';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.suppliers s WHERE s.id = v_supplier_id
    ) THEN
      RAISE EXCEPTION 'APP:NOT_FOUND:仕入先が見つかりません';
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
        v_purchase_price := (v_row->>'purchase_price')::numeric;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:仕入価格が不正です';
      END;
      -- 明示 0 円は有効
      IF v_purchase_price IS NULL OR v_purchase_price < 0 THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:仕入価格は0円以上で入力してください';
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
      v_purchase_price := (v_row->>'purchase_price')::numeric;
      v_start_date := NULLIF(btrim(v_row->>'start_date'), '')::date;
      v_end_date := NULLIF(btrim(v_row->>'end_date'), '')::date;
      v_memo := NULLIF(btrim(v_row->>'memo'), '');
      BEGIN
        v_is_active := coalesce((v_row->>'is_active')::boolean, true);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:有効フラグが不正です';
      END;

      INSERT INTO public.purchase_prices (
        price_target_type,
        product_id,
        package_id,
        supplier_id,
        purchase_price,
        start_date,
        end_date,
        memo,
        is_active
      ) VALUES (
        v_price_target_type,
        v_product_id,
        v_package_id,
        v_supplier_id,
        v_purchase_price,
        v_start_date,
        v_end_date,
        v_memo,
        v_is_active
      )
      RETURNING id INTO v_price_id;

      v_created_ids := array_append(v_created_ids, v_price_id);
    END LOOP;

    UPDATE public.supplier_purchase_price_bulk_requests
    SET status = 'COMPLETED',
        supplier_id = v_supplier_id,
        error_code = NULL,
        error_message = NULL,
        completed_at = clock_timestamp(),
        response = jsonb_build_object(
          'ok', true,
          'status', 'COMPLETED',
          'request_id', v_request_id,
          'supplier_id', v_supplier_id,
          'purchase_price_ids', to_jsonb(v_created_ids),
          'item_count', jsonb_array_length(v_items),
          'idempotent_replay', false
        )
    WHERE request_id = v_request_id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'COMPLETED',
      'request_id', v_request_id,
      'supplier_id', v_supplier_id,
      'purchase_price_ids', to_jsonb(v_created_ids),
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
      'SUPPLIER_PRICE_BULK_FAILED'
    ) THEN
      v_app_code := 'SUPPLIER_PRICE_BULK_FAILED';
      v_app_message := '仕入価格を一括登録できませんでした';
    ELSIF v_app_message IS NULL THEN
      v_app_message := '仕入価格を一括登録できませんでした';
    END IF;

    UPDATE public.supplier_purchase_price_bulk_requests
    SET status = 'FAILED',
        supplier_id = NULL,
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

COMMENT ON FUNCTION public.create_supplier_purchase_prices(jsonb) IS
  '仕入先1社に対する複数 PRODUCT/PACKAGE 仕入価格を1トランザクションでINSERT。既存行非更新。0円可。冪等ledger付き。';


REVOKE ALL ON FUNCTION public.create_supplier_purchase_prices(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.create_supplier_purchase_prices(jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.create_supplier_purchase_prices(jsonb) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION public.create_supplier_purchase_prices(jsonb) FROM service_role;
    GRANT EXECUTE ON FUNCTION public.create_supplier_purchase_prices(jsonb) TO service_role;
  END IF;
END $$;
