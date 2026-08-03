-- Ver1.0: 管理者発注の一括作成 RPC（create_purchase_orders）
--
-- 目的:
-- - 仕入先ごとに複数 orders + order_items を 1 トランザクションで作成する
-- - クライアント直書きの途中失敗（一部発注だけ残る）を防ぐ
--
-- 範囲:
-- - 新規テーブル: purchase_order_create_requests（冪等 ledger）
-- - 新規関数: public.create_purchase_orders(jsonb) SECURITY INVOKER
-- - 任意: orders.order_no の部分 UNIQUE（NULL/空以外）
-- - EXECUTE / ledger 権限: service_role のみ
-- - 既存業務データは変更しない。Additive only。
-- - 本番適用は別手順（本 PR では適用しない）
--
-- payload:
-- {
--   "request_id": "uuid",
--   "case_id": "uuid",
--   "case_status": "string|null",   -- 任意。指定時のみ cases.status を更新
--   "orders": [
--     {
--       "supplier_id": "uuid",
--       "order_no": "string",
--       "order_date": "YYYY-MM-DD",
--       "expected_delivery_date": "YYYY-MM-DD|null",
--       "delivered_date": "YYYY-MM-DD|null",
--       "status": "string",
--       "memo": "string|null",
--       "items": [
--         {
--           "product_id": "uuid",
--           "case_product_id": "uuid|null",
--           "quantity": number,
--           "unit_price": number,
--           "memo": "string|null",
--           "sort_order": number
--         }
--       ]
--     }
--   ]
-- }
-- ※ order_amount / item.amount はサーバ側で再計算する（クライアント値は信用しない）

CREATE TABLE IF NOT EXISTS public.purchase_order_create_requests (
  request_id uuid PRIMARY KEY,
  case_id uuid NULL REFERENCES public.cases (id) ON DELETE SET NULL,
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
    WHERE conname = 'purchase_order_create_requests_status_check'
      AND conrelid = 'public.purchase_order_create_requests'::regclass
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'purchase_order_create_requests_status_check'
        AND conrelid = 'public.purchase_order_create_requests'::regclass
        AND pg_get_constraintdef(oid) ILIKE '%PROCESSING%'
        AND pg_get_constraintdef(oid) ILIKE '%COMPLETED%'
        AND pg_get_constraintdef(oid) ILIKE '%FAILED%'
    ) THEN
      RAISE EXCEPTION
        'purchase_order_create_requests_status_check exists with unexpected definition';
    END IF;
  ELSE
    ALTER TABLE public.purchase_order_create_requests
      ADD CONSTRAINT purchase_order_create_requests_status_check
      CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS purchase_order_create_requests_case_id_idx
  ON public.purchase_order_create_requests (case_id);

CREATE INDEX IF NOT EXISTS purchase_order_create_requests_status_created_at_idx
  ON public.purchase_order_create_requests (status, created_at);

COMMENT ON TABLE public.purchase_order_create_requests IS
  '仕入発注一括作成RPCの冪等キー。payload_hash で同一request_idの異payloadを拒否。';

COMMENT ON COLUMN public.purchase_order_create_requests.payload_hash IS
  'md5(payload::text)。jsonb正規化によりキー順差を吸収。';

ALTER TABLE public.purchase_order_create_requests DISABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.purchase_order_create_requests FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.purchase_order_create_requests FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.purchase_order_create_requests FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.purchase_order_create_requests FROM service_role;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.purchase_order_create_requests TO service_role;
  END IF;
END $$;

-- order_no 一意（NULL/空以外）。既存重複がある場合は作成を拒否して停止する。
DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE NOTICE 'public.orders not found; skip order_no unique index';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders
    WHERE order_no IS NOT NULL AND btrim(order_no) <> ''
    GROUP BY btrim(order_no)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create orders_order_no_unique: duplicate non-empty order_no values exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'orders_order_no_unique'
      AND c.relkind IN ('i', 'I')
  ) THEN
    EXECUTE $idx$
      CREATE UNIQUE INDEX orders_order_no_unique
        ON public.orders (btrim(order_no))
        WHERE order_no IS NOT NULL AND btrim(order_no) <> ''
    $idx$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_purchase_orders(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c_max_orders constant int := 50;
  c_max_items_per_order constant int := 500;
  c_max_qty constant numeric := 9999;
  c_max_str_long constant int := 2000;
  c_max_order_no constant int := 100;

  v_request_id uuid;
  v_payload_hash text;
  v_existing public.purchase_order_create_requests%ROWTYPE;
  v_case_id uuid;
  v_case_status text;
  v_orders jsonb;
  v_order jsonb;
  v_items jsonb;
  v_item jsonb;
  v_order_idx int;
  v_item_idx int;
  v_supplier_id uuid;
  v_order_no text;
  v_order_date date;
  v_expected_delivery_date date;
  v_delivered_date date;
  v_status text;
  v_memo text;
  v_order_id uuid;
  v_product_id uuid;
  v_case_product_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_amount numeric;
  v_sort_order int;
  v_item_memo text;
  v_order_amount numeric;
  v_seen_suppliers uuid[] := ARRAY[]::uuid[];
  v_seen_order_nos text[] := ARRAY[]::text[];
  v_created jsonb := '[]'::jsonb;
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
  FROM public.purchase_order_create_requests
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

  INSERT INTO public.purchase_order_create_requests (
    request_id, case_id, status, payload_hash
  ) VALUES (
    v_request_id, NULL, 'PROCESSING', v_payload_hash
  );

  BEGIN
    BEGIN
      v_case_id := NULLIF(btrim(payload->>'case_id'), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:case_id が不正です';
    END;
    IF v_case_id IS NULL THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:case_id は必須です';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.cases WHERE id = v_case_id) THEN
      RAISE EXCEPTION 'APP:NOT_FOUND:案件が見つかりません';
    END IF;

    v_case_status := NULLIF(btrim(payload->>'case_status'), '');
    IF v_case_status IS NOT NULL AND char_length(v_case_status) > 100 THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:case_status が長すぎます';
    END IF;

    v_orders := payload->'orders';
    IF v_orders IS NULL OR jsonb_typeof(v_orders) <> 'array' THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:orders は配列である必要があります';
    END IF;
    IF jsonb_array_length(v_orders) < 1 THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:発注が1件以上必要です';
    END IF;
    IF jsonb_array_length(v_orders) > c_max_orders THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:発注件数が上限を超えています';
    END IF;

    FOR v_order_idx IN 0 .. jsonb_array_length(v_orders) - 1 LOOP
      v_order := v_orders->v_order_idx;
      IF v_order IS NULL OR jsonb_typeof(v_order) <> 'object' THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:orders[%] が不正です', v_order_idx;
      END IF;

      BEGIN
        v_supplier_id := NULLIF(btrim(v_order->>'supplier_id'), '')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:仕入先が不正です';
      END;
      IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:仕入先を選択してください';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE s.id = v_supplier_id
          AND COALESCE(s.is_active, true) = true
      ) THEN
        RAISE EXCEPTION 'APP:NOT_FOUND:仕入先が見つかりません';
      END IF;
      IF v_supplier_id = ANY (v_seen_suppliers) THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:同じ仕入先の発注が重複しています';
      END IF;
      v_seen_suppliers := array_append(v_seen_suppliers, v_supplier_id);

      v_order_no := NULLIF(btrim(v_order->>'order_no'), '');
      IF v_order_no IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:発注番号を入力してください';
      END IF;
      IF char_length(v_order_no) > c_max_order_no THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:発注番号が長すぎます';
      END IF;
      IF v_order_no = ANY (v_seen_order_nos) THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:発注番号がリクエスト内で重複しています';
      END IF;
      v_seen_order_nos := array_append(v_seen_order_nos, v_order_no);
      IF EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.order_no IS NOT NULL
          AND btrim(o.order_no) = v_order_no
      ) THEN
        RAISE EXCEPTION 'APP:DUPLICATE_ORDER_NO:同じ発注番号がすでに登録されています';
      END IF;

      BEGIN
        v_order_date := NULLIF(btrim(v_order->>'order_date'), '')::date;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:発注日が不正です';
      END;
      IF v_order_date IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:発注日を入力してください';
      END IF;

      BEGIN
        v_expected_delivery_date := NULLIF(btrim(v_order->>'expected_delivery_date'), '')::date;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:納品予定日が不正です';
      END;
      IF v_expected_delivery_date IS NOT NULL AND v_expected_delivery_date < v_order_date THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:納品予定日は発注日以降に設定してください';
      END IF;

      BEGIN
        v_delivered_date := NULLIF(btrim(v_order->>'delivered_date'), '')::date;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:納品日が不正です';
      END;

      v_status := NULLIF(btrim(v_order->>'status'), '');
      IF v_status IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:発注ステータスを入力してください';
      END IF;
      IF char_length(v_status) > 100 THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:発注ステータスが長すぎます';
      END IF;

      v_memo := NULLIF(btrim(v_order->>'memo'), '');
      IF v_memo IS NOT NULL AND char_length(v_memo) > c_max_str_long THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:備考が長すぎます';
      END IF;

      v_items := v_order->'items';
      IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:発注明細が不正です';
      END IF;
      IF jsonb_array_length(v_items) < 1 THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:発注明細がありません';
      END IF;
      IF jsonb_array_length(v_items) > c_max_items_per_order THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:発注明細が上限を超えています';
      END IF;

      v_order_amount := 0;

      -- 先に金額検証してから INSERT（途中失敗を最小化）
      FOR v_item_idx IN 0 .. jsonb_array_length(v_items) - 1 LOOP
        v_item := v_items->v_item_idx;
        IF v_item IS NULL OR jsonb_typeof(v_item) <> 'object' THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:発注明細が不正です';
        END IF;

        BEGIN
          v_product_id := NULLIF(btrim(v_item->>'product_id'), '')::uuid;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:商品が不正です';
        END;
        IF v_product_id IS NULL THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:商品が紐づいていない明細があります';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = v_product_id) THEN
          RAISE EXCEPTION 'APP:NOT_FOUND:商品が見つかりません';
        END IF;

        BEGIN
          v_case_product_id := NULLIF(btrim(v_item->>'case_product_id'), '')::uuid;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:案件商品参照が不正です';
        END;
        IF v_case_product_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.case_products cp
          WHERE cp.id = v_case_product_id AND cp.case_id = v_case_id
        ) THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:案件商品参照が不正です';
        END IF;

        BEGIN
          v_quantity := (v_item->>'quantity')::numeric;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:数量は1以上の整数で入力してください';
        END;
        IF v_quantity IS NULL
           OR v_quantity <> trunc(v_quantity)
           OR v_quantity < 1
           OR v_quantity > c_max_qty THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:数量は1以上の整数で入力してください';
        END IF;

        IF v_item->>'unit_price' IS NULL OR btrim(v_item->>'unit_price') = '' THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:仕入単価が未設定の明細があります';
        END IF;
        BEGIN
          v_unit_price := (v_item->>'unit_price')::numeric;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:仕入単価は0以上で入力してください';
        END;
        IF v_unit_price IS NULL OR v_unit_price < 0 OR v_unit_price <> trunc(v_unit_price) THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:仕入単価は0以上の整数で入力してください';
        END IF;

        v_amount := round(v_quantity * v_unit_price);
        IF v_amount < 0 THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:明細金額が不正です';
        END IF;
        v_order_amount := v_order_amount + v_amount;
      END LOOP;

      IF v_order_amount <= 0 THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:発注金額は1円以上になるよう明細を入力してください';
      END IF;

      INSERT INTO public.orders (
        case_id,
        supplier_id,
        order_no,
        order_date,
        expected_delivery_date,
        delivered_date,
        order_amount,
        status,
        memo
      ) VALUES (
        v_case_id,
        v_supplier_id,
        v_order_no,
        v_order_date,
        v_expected_delivery_date,
        v_delivered_date,
        v_order_amount,
        v_status,
        v_memo
      )
      RETURNING id INTO v_order_id;

      FOR v_item_idx IN 0 .. jsonb_array_length(v_items) - 1 LOOP
        v_item := v_items->v_item_idx;
        v_product_id := NULLIF(btrim(v_item->>'product_id'), '')::uuid;
        v_case_product_id := NULLIF(btrim(v_item->>'case_product_id'), '')::uuid;
        v_quantity := (v_item->>'quantity')::numeric;
        v_unit_price := (v_item->>'unit_price')::numeric;
        v_amount := round(v_quantity * v_unit_price);
        v_item_memo := NULLIF(btrim(v_item->>'memo'), '');
        IF v_item_memo IS NOT NULL AND char_length(v_item_memo) > c_max_str_long THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:明細備考が長すぎます';
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

      v_created := v_created || jsonb_build_array(
        jsonb_build_object(
          'id', v_order_id,
          'order_no', v_order_no,
          'supplier_id', v_supplier_id,
          'order_amount', v_order_amount,
          'item_count', jsonb_array_length(v_items)
        )
      );
    END LOOP;

    IF v_case_status IS NOT NULL THEN
      UPDATE public.cases
      SET status = v_case_status
      WHERE id = v_case_id;
    END IF;

    UPDATE public.purchase_order_create_requests
    SET status = 'COMPLETED',
        case_id = v_case_id,
        error_code = NULL,
        error_message = NULL,
        completed_at = clock_timestamp(),
        response = jsonb_build_object(
          'ok', true,
          'status', 'COMPLETED',
          'request_id', v_request_id,
          'case_id', v_case_id,
          'orders', v_created,
          'idempotent_replay', false
        )
    WHERE request_id = v_request_id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'COMPLETED',
      'request_id', v_request_id,
      'case_id', v_case_id,
      'orders', v_created,
      'idempotent_replay', false
    );

  EXCEPTION
    WHEN unique_violation THEN
      v_app_code := 'DUPLICATE_ORDER_NO';
      v_app_message := '同じ発注番号がすでに登録されています';

      UPDATE public.purchase_order_create_requests
      SET status = 'FAILED',
          case_id = NULL,
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
      'DUPLICATE_ORDER_NO',
      'REQUEST_ID_CONFLICT',
      'REQUEST_IN_PROGRESS',
      'ORDER_CREATE_FAILED'
    ) THEN
      v_app_code := 'ORDER_CREATE_FAILED';
      v_app_message := '発注を登録できませんでした';
    ELSIF v_app_message IS NULL THEN
      v_app_message := '発注を登録できませんでした';
    END IF;

    UPDATE public.purchase_order_create_requests
    SET status = 'FAILED',
        case_id = NULL,
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

    -- 本体の INSERT は同一トランザクション内なので自動ロールバックされる。
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

COMMENT ON FUNCTION public.create_purchase_orders(jsonb) IS
  '仕入先単位の複数発注+明細を1トランザクションで作成。冪等ledger付き。EXECUTEはservice_roleのみ。';

REVOKE ALL ON FUNCTION public.create_purchase_orders(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.create_purchase_orders(jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.create_purchase_orders(jsonb) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION public.create_purchase_orders(jsonb) FROM service_role;
    GRANT EXECUTE ON FUNCTION public.create_purchase_orders(jsonb) TO service_role;
  END IF;
END $$;
