-- Ver1.0: 商品一括登録 RPC（create_product_bulk_setup）
--
-- 目的:
-- - 1 manufacturer_id (+ 任意 category / series_id) に対し、複数 products を
--   1 トランザクションで作成する
-- - 仕入価格・販売価格は同梱しない（既存 /prices /sales-prices / product-setups を維持）
-- - create_product_setup / create_existing_product_price_setup は変更しない
--
-- Additive only. EXECUTE / ledger: service_role のみ。

CREATE TABLE IF NOT EXISTS public.product_bulk_setup_requests (
  request_id uuid PRIMARY KEY,
  manufacturer_id uuid NULL REFERENCES public.manufacturers (id) ON DELETE SET NULL,
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
    WHERE conname = 'product_bulk_setup_requests_status_check'
      AND conrelid = 'public.product_bulk_setup_requests'::regclass
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'product_bulk_setup_requests_status_check'
        AND conrelid = 'public.product_bulk_setup_requests'::regclass
        AND pg_get_constraintdef(oid) ILIKE '%PROCESSING%'
        AND pg_get_constraintdef(oid) ILIKE '%COMPLETED%'
        AND pg_get_constraintdef(oid) ILIKE '%FAILED%'
    ) THEN
      RAISE EXCEPTION
        'product_bulk_setup_requests_status_check exists with unexpected definition';
    END IF;
  ELSE
    ALTER TABLE public.product_bulk_setup_requests
      ADD CONSTRAINT product_bulk_setup_requests_status_check
      CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS product_bulk_setup_requests_manufacturer_id_idx
  ON public.product_bulk_setup_requests (manufacturer_id);

CREATE INDEX IF NOT EXISTS product_bulk_setup_requests_status_created_at_idx
  ON public.product_bulk_setup_requests (status, created_at);

COMMENT ON TABLE public.product_bulk_setup_requests IS
  '商品一括登録RPCの冪等キー。価格非同梱。';

ALTER TABLE public.product_bulk_setup_requests DISABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.product_bulk_setup_requests FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.product_bulk_setup_requests FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.product_bulk_setup_requests FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.product_bulk_setup_requests FROM service_role;
    GRANT SELECT, INSERT, UPDATE
      ON TABLE public.product_bulk_setup_requests TO service_role;
  END IF;
END $$;

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
      v_model_key := lower(v_model_no);
      IF v_model_key = ANY (v_seen_models) THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:行%: 同じ型番が複数行に入力されています', v_row_no;
      END IF;
      v_seen_models := array_append(v_seen_models, v_model_key);

      IF EXISTS (
        SELECT 1
        FROM public.products p
        WHERE p.manufacturer_id = v_manufacturer_id
          AND lower(btrim(coalesce(p.model_no, ''))) = v_model_key
      ) THEN
        RAISE EXCEPTION
          'APP:DUPLICATE_PRODUCT:行%: 同じメーカーに同一型番が既に登録されています',
          v_row_no;
      END IF;

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

COMMENT ON FUNCTION public.create_product_bulk_setup(jsonb) IS
  'メーカー配下の複数productsを1トランザクションでINSERT。価格非同梱。冪等ledger付き。';

REVOKE ALL ON FUNCTION public.create_product_bulk_setup(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.create_product_bulk_setup(jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.create_product_bulk_setup(jsonb) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION public.create_product_bulk_setup(jsonb) FROM service_role;
    GRANT EXECUTE ON FUNCTION public.create_product_bulk_setup(jsonb) TO service_role;
  END IF;
END $$;
