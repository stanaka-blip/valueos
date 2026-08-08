-- Ver1.0: 既存商品への仕入/販売価格一括登録 RPC
--
-- 目的:
-- - 既存 product_id に対し purchase_prices[] + sales_prices[] を 1 トランザクションで追加
-- - products は INSERT/UPDATE しない
-- - #106 create_product_setup（新規商品）は変更しない
--
-- 範囲:
-- - 新規テーブル: existing_product_price_setup_requests
-- - 新規関数: public.create_existing_product_price_setup(jsonb)
-- - EXECUTE / ledger: service_role のみ
-- - PACKAGE 非対応 / auto end_date なし / 価格判定変更なし

CREATE TABLE IF NOT EXISTS public.existing_product_price_setup_requests (
  request_id uuid PRIMARY KEY,
  product_id uuid NULL REFERENCES public.products (id) ON DELETE SET NULL,
  status text NOT NULL,
  payload_hash text NOT NULL,
  error_code text NULL,
  error_message text NULL,
  response jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'existing_product_price_setup_requests_status_check'
      AND conrelid = 'public.existing_product_price_setup_requests'::regclass
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'existing_product_price_setup_requests_status_check'
        AND conrelid = 'public.existing_product_price_setup_requests'::regclass
        AND pg_get_constraintdef(oid) ILIKE '%PROCESSING%'
        AND pg_get_constraintdef(oid) ILIKE '%COMPLETED%'
        AND pg_get_constraintdef(oid) ILIKE '%FAILED%'
    ) THEN
      RAISE EXCEPTION
        'existing_product_price_setup_requests_status_check exists with unexpected definition';
    END IF;
  ELSE
    ALTER TABLE public.existing_product_price_setup_requests
      ADD CONSTRAINT existing_product_price_setup_requests_status_check
      CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS existing_product_price_setup_requests_product_id_idx
  ON public.existing_product_price_setup_requests (product_id);

CREATE INDEX IF NOT EXISTS existing_product_price_setup_requests_status_created_at_idx
  ON public.existing_product_price_setup_requests (status, created_at);

COMMENT ON TABLE public.existing_product_price_setup_requests IS
  '既存商品への価格一括追加RPCの冪等キー。';

ALTER TABLE public.existing_product_price_setup_requests DISABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.existing_product_price_setup_requests FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.existing_product_price_setup_requests FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.existing_product_price_setup_requests FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.existing_product_price_setup_requests FROM service_role;
    GRANT SELECT, INSERT, UPDATE
      ON TABLE public.existing_product_price_setup_requests TO service_role;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_existing_product_price_setup(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c_max_purchase constant int := 50;
  c_max_sales constant int := 100;

  v_request_id uuid;
  v_payload_hash text;
  v_existing public.existing_product_price_setup_requests%ROWTYPE;
  v_purchase_prices jsonb;
  v_sales_prices jsonb;
  v_row jsonb;

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
  FROM public.existing_product_price_setup_requests
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

  INSERT INTO public.existing_product_price_setup_requests (
    request_id, product_id, status, payload_hash
  ) VALUES (
    v_request_id, NULL, 'PROCESSING', v_payload_hash
  );

  BEGIN
    BEGIN
      v_product_id := NULLIF(btrim(payload->>'product_id'), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:商品が不正です';
    END;
    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:商品は必須です';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.id = v_product_id
    ) THEN
      RAISE EXCEPTION 'APP:NOT_FOUND:商品が見つかりません';
    END IF;

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

    -- 既存商品は変更しない。価格のみ追加。
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

    UPDATE public.existing_product_price_setup_requests
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
      'REQUEST_ID_CONFLICT',
      'REQUEST_IN_PROGRESS',
      'PRODUCT_PRICE_SETUP_FAILED'
    ) THEN
      v_app_code := 'PRODUCT_PRICE_SETUP_FAILED';
      v_app_message := '価格セットアップを登録できませんでした';
    ELSIF v_app_message IS NULL THEN
      v_app_message := '価格セットアップを登録できませんでした';
    END IF;

    UPDATE public.existing_product_price_setup_requests
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

COMMENT ON FUNCTION public.create_existing_product_price_setup(jsonb) IS
  '既存商品へ仕入/販売価格を1トランザクションで追加。products非更新。冪等ledger付き。PACKAGE非対応。';

REVOKE ALL ON FUNCTION public.create_existing_product_price_setup(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.create_existing_product_price_setup(jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.create_existing_product_price_setup(jsonb) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION public.create_existing_product_price_setup(jsonb) FROM service_role;
    GRANT EXECUTE ON FUNCTION public.create_existing_product_price_setup(jsonb) TO service_role;
  END IF;
END $$;
