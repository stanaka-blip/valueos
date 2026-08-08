-- Ver1.0: パッケージ一括登録 RPC（create_package_bulk_setup）
--
-- 目的:
-- - 1 manufacturer_id (+ 任意 series_id) に対し、複数 packages + package_items を
--   1 トランザクションで作成する
-- - packages INSERT 後に items 失敗で空パッケージが残る事故を防ぐ
-- - 仕入価格・販売価格は同梱しない（既存 /prices /sales-prices 導線を維持）
-- - #106 / #108 / #109 / #110 RPC は変更しない
--
-- 範囲:
-- - 新規テーブル: package_bulk_setup_requests
-- - 新規関数: public.create_package_bulk_setup(jsonb)
-- - EXECUTE / ledger: service_role のみ
-- - Additive only

CREATE TABLE IF NOT EXISTS public.package_bulk_setup_requests (
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
    WHERE conname = 'package_bulk_setup_requests_status_check'
      AND conrelid = 'public.package_bulk_setup_requests'::regclass
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'package_bulk_setup_requests_status_check'
        AND conrelid = 'public.package_bulk_setup_requests'::regclass
        AND pg_get_constraintdef(oid) ILIKE '%PROCESSING%'
        AND pg_get_constraintdef(oid) ILIKE '%COMPLETED%'
        AND pg_get_constraintdef(oid) ILIKE '%FAILED%'
    ) THEN
      RAISE EXCEPTION
        'package_bulk_setup_requests_status_check exists with unexpected definition';
    END IF;
  ELSE
    ALTER TABLE public.package_bulk_setup_requests
      ADD CONSTRAINT package_bulk_setup_requests_status_check
      CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS package_bulk_setup_requests_manufacturer_id_idx
  ON public.package_bulk_setup_requests (manufacturer_id);

CREATE INDEX IF NOT EXISTS package_bulk_setup_requests_status_created_at_idx
  ON public.package_bulk_setup_requests (status, created_at);

COMMENT ON TABLE public.package_bulk_setup_requests IS
  'パッケージ一括登録RPCの冪等キー。';

ALTER TABLE public.package_bulk_setup_requests DISABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.package_bulk_setup_requests FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.package_bulk_setup_requests FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.package_bulk_setup_requests FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.package_bulk_setup_requests FROM service_role;
    GRANT SELECT, INSERT, UPDATE
      ON TABLE public.package_bulk_setup_requests TO service_role;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_package_bulk_setup(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c_max_packages constant int := 50;
  c_max_items_per_package constant int := 50;
  c_max_str_short constant int := 200;
  c_max_str_long constant int := 2000;

  v_request_id uuid;
  v_payload_hash text;
  v_existing public.package_bulk_setup_requests%ROWTYPE;
  v_packages jsonb;
  v_pkg jsonb;
  v_items jsonb;
  v_item jsonb;

  v_manufacturer_id uuid;
  v_series_id uuid;
  v_package_id uuid;
  v_product_id uuid;
  v_supplier_id uuid;
  v_name text;
  v_capacity numeric;
  v_capacity_unit text;
  v_warranty_years numeric;
  v_memo text;
  v_is_active boolean;
  v_quantity numeric;

  v_pkg_idx int;
  v_item_idx int;
  v_seen_names text[] := ARRAY[]::text[];
  v_seen_products uuid[];
  v_created_ids uuid[] := ARRAY[]::uuid[];
  v_name_key text;

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
  FROM public.package_bulk_setup_requests
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

  INSERT INTO public.package_bulk_setup_requests (
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

    v_packages := payload->'packages';
    IF v_packages IS NULL OR jsonb_typeof(v_packages) <> 'array' THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:packages は配列である必要があります';
    END IF;
    IF jsonb_array_length(v_packages) < 1 THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージが1件以上必要です';
    END IF;
    IF jsonb_array_length(v_packages) > c_max_packages THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージ件数が上限を超えています';
    END IF;

    -- validate all packages/items first
    FOR v_pkg_idx IN 0 .. jsonb_array_length(v_packages) - 1 LOOP
      v_pkg := v_packages->v_pkg_idx;
      IF v_pkg IS NULL OR jsonb_typeof(v_pkg) <> 'object' THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:packages の行が不正です';
      END IF;

      v_name := NULLIF(btrim(v_pkg->>'name'), '');
      IF v_name IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージ名は必須です';
      END IF;
      IF char_length(v_name) > c_max_str_short THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージ名が長すぎます';
      END IF;
      v_name_key := lower(v_name);
      IF v_name_key = ANY (v_seen_names) THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:同じパッケージ名が複数行に入力されています';
      END IF;
      v_seen_names := array_append(v_seen_names, v_name_key);

      v_supplier_id := NULL;
      IF NULLIF(btrim(v_pkg->>'default_supplier_id'), '') IS NOT NULL THEN
        BEGIN
          v_supplier_id := btrim(v_pkg->>'default_supplier_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:標準仕入先が不正です';
        END;
        IF NOT EXISTS (
          SELECT 1 FROM public.suppliers s WHERE s.id = v_supplier_id
        ) THEN
          RAISE EXCEPTION 'APP:NOT_FOUND:標準仕入先が見つかりません';
        END IF;
      END IF;

      v_capacity := NULL;
      IF NULLIF(btrim(v_pkg->>'capacity'), '') IS NOT NULL THEN
        BEGIN
          v_capacity := (v_pkg->>'capacity')::numeric;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:容量が不正です';
        END;
        IF v_capacity IS NOT NULL AND v_capacity < 0 THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:容量が不正です';
        END IF;
      END IF;

      v_capacity_unit := NULLIF(btrim(v_pkg->>'capacity_unit'), '');
      IF v_capacity_unit IS NOT NULL AND char_length(v_capacity_unit) > c_max_str_short THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:容量単位が長すぎます';
      END IF;

      v_warranty_years := NULL;
      IF NULLIF(btrim(v_pkg->>'warranty_years'), '') IS NOT NULL THEN
        BEGIN
          v_warranty_years := (v_pkg->>'warranty_years')::numeric;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:保証年数が不正です';
        END;
        IF v_warranty_years IS NOT NULL AND v_warranty_years < 0 THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:保証年数が不正です';
        END IF;
      END IF;

      v_memo := NULLIF(btrim(v_pkg->>'memo'), '');
      IF v_memo IS NOT NULL AND char_length(v_memo) > c_max_str_long THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:メモが長すぎます';
      END IF;

      v_items := v_pkg->'items';
      IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:構成商品は配列である必要があります';
      END IF;
      IF jsonb_array_length(v_items) < 1 THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:構成商品が1件以上必要です';
      END IF;
      IF jsonb_array_length(v_items) > c_max_items_per_package THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:構成商品数が上限を超えています';
      END IF;

      v_seen_products := ARRAY[]::uuid[];
      FOR v_item_idx IN 0 .. jsonb_array_length(v_items) - 1 LOOP
        v_item := v_items->v_item_idx;
        IF v_item IS NULL OR jsonb_typeof(v_item) <> 'object' THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:構成商品の行が不正です';
        END IF;

        BEGIN
          v_product_id := NULLIF(btrim(v_item->>'product_id'), '')::uuid;
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

        IF NOT EXISTS (
          SELECT 1 FROM public.products p WHERE p.id = v_product_id
        ) THEN
          RAISE EXCEPTION 'APP:NOT_FOUND:商品が見つかりません';
        END IF;

        BEGIN
          v_quantity := (v_item->>'quantity')::numeric;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:数量が不正です';
        END;
        IF v_quantity IS NULL OR v_quantity <= 0 THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:数量は1以上で入力してください';
        END IF;
      END LOOP;
    END LOOP;

    -- insert packages + items
    FOR v_pkg_idx IN 0 .. jsonb_array_length(v_packages) - 1 LOOP
      v_pkg := v_packages->v_pkg_idx;
      v_name := btrim(v_pkg->>'name');
      v_supplier_id := NULLIF(btrim(v_pkg->>'default_supplier_id'), '')::uuid;
      v_capacity := NULLIF(btrim(v_pkg->>'capacity'), '')::numeric;
      v_capacity_unit := coalesce(
        NULLIF(btrim(v_pkg->>'capacity_unit'), ''),
        'kWh'
      );
      v_warranty_years := NULLIF(btrim(v_pkg->>'warranty_years'), '')::numeric;
      v_memo := NULLIF(btrim(v_pkg->>'memo'), '');
      BEGIN
        v_is_active := coalesce((v_pkg->>'is_active')::boolean, true);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:有効フラグが不正です';
      END;

      INSERT INTO public.packages (
        manufacturer_id,
        series_id,
        name,
        capacity,
        capacity_unit,
        warranty_years,
        memo,
        is_active,
        pricing_method,
        default_supplier_id
      ) VALUES (
        v_manufacturer_id,
        v_series_id,
        v_name,
        v_capacity,
        v_capacity_unit,
        v_warranty_years,
        v_memo,
        v_is_active,
        'fixed',
        v_supplier_id
      )
      RETURNING id INTO v_package_id;

      v_created_ids := array_append(v_created_ids, v_package_id);

      v_items := v_pkg->'items';
      FOR v_item_idx IN 0 .. jsonb_array_length(v_items) - 1 LOOP
        v_item := v_items->v_item_idx;
        v_product_id := btrim(v_item->>'product_id')::uuid;
        v_quantity := (v_item->>'quantity')::numeric;

        INSERT INTO public.package_items (
          package_id,
          product_id,
          quantity,
          requirement_type,
          sort_order
        ) VALUES (
          v_package_id,
          v_product_id,
          v_quantity,
          'required',
          v_item_idx + 1
        );
      END LOOP;
    END LOOP;

    UPDATE public.package_bulk_setup_requests
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
          'package_ids', to_jsonb(v_created_ids),
          'package_count', jsonb_array_length(v_packages),
          'idempotent_replay', false
        )
    WHERE request_id = v_request_id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'COMPLETED',
      'request_id', v_request_id,
      'manufacturer_id', v_manufacturer_id,
      'series_id', v_series_id,
      'package_ids', to_jsonb(v_created_ids),
      'package_count', jsonb_array_length(v_packages),
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
      'PACKAGE_BULK_SETUP_FAILED'
    ) THEN
      v_app_code := 'PACKAGE_BULK_SETUP_FAILED';
      v_app_message := 'パッケージを一括登録できませんでした';
    ELSIF v_app_message IS NULL THEN
      v_app_message := 'パッケージを一括登録できませんでした';
    END IF;

    UPDATE public.package_bulk_setup_requests
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

COMMENT ON FUNCTION public.create_package_bulk_setup(jsonb) IS
  'メーカー配下の複数packages+package_itemsを1トランザクションでINSERT。価格非同梱。冪等ledger付き。';

REVOKE ALL ON FUNCTION public.create_package_bulk_setup(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.create_package_bulk_setup(jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.create_package_bulk_setup(jsonb) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION public.create_package_bulk_setup(jsonb) FROM service_role;
    GRANT EXECUTE ON FUNCTION public.create_package_bulk_setup(jsonb) TO service_role;
  END IF;
END $$;
