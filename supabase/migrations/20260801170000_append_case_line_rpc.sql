-- Ver1.0: 既存案件への明細追記 RPC（append_case_line）
--
-- - 新規テーブル: case_line_append_requests（冪等 ledger）
-- - 新規関数: public.append_case_line(jsonb) SECURITY INVOKER
-- - EXECUTE / ledger 権限: service_role のみ（PUBLIC/anon/authenticated は REVOKE）
-- - create_case_registration / 既存業務データ / RLS は変更しない
-- - Additive only。本番適用は別手順（本 PR では適用しない）
--
-- 冪等 payload 範囲（hash 対象 = RPC に渡す jsonb 全体）:
--   request_id, case_id, line_type, product_id, package_id, quantity, memo
--   ※ client の request_id は API で破棄し、server 派生 request_id を注入する
--   ※ case_id は URL を正とし API が注入する
--   ※ payload_hash = md5(payload::text)（jsonb 正規化でキー順差を吸収）

CREATE TABLE IF NOT EXISTS public.case_line_append_requests (
  request_id uuid PRIMARY KEY,
  case_id uuid NULL REFERENCES public.cases (id) ON DELETE SET NULL,
  case_product_id uuid NULL,
  case_package_id uuid NULL,
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
    WHERE conname = 'case_line_append_requests_status_check'
      AND conrelid = 'public.case_line_append_requests'::regclass
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'case_line_append_requests_status_check'
        AND conrelid = 'public.case_line_append_requests'::regclass
        AND pg_get_constraintdef(oid) ILIKE '%PROCESSING%'
        AND pg_get_constraintdef(oid) ILIKE '%COMPLETED%'
        AND pg_get_constraintdef(oid) ILIKE '%FAILED%'
    ) THEN
      RAISE EXCEPTION
        'case_line_append_requests_status_check exists with unexpected definition';
    END IF;
  ELSE
    ALTER TABLE public.case_line_append_requests
      ADD CONSTRAINT case_line_append_requests_status_check
      CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS case_line_append_requests_case_id_idx
  ON public.case_line_append_requests (case_id);

CREATE INDEX IF NOT EXISTS case_line_append_requests_status_created_at_idx
  ON public.case_line_append_requests (status, created_at);

COMMENT ON TABLE public.case_line_append_requests IS
  '案件明細追記RPCの冪等キー。payload_hash で同一request_idの異payloadを拒否。';

COMMENT ON COLUMN public.case_line_append_requests.payload_hash IS
  'md5(jsonb::text)。jsonb正規化によりキー順差を吸収。対象: request_id/case_id/line_type/product_id/package_id/quantity/memo。';

ALTER TABLE public.case_line_append_requests DISABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.case_line_append_requests FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.case_line_append_requests FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.case_line_append_requests FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.case_line_append_requests FROM service_role;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.case_line_append_requests TO service_role;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.append_case_line(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c_max_qty constant numeric := 9999;
  c_max_pkg_items constant int := 500;
  c_max_str_long constant int := 2000;

  v_request_id uuid;
  v_payload_hash text;
  v_existing public.case_line_append_requests%ROWTYPE;
  v_case_id uuid;
  v_line_type text;
  v_product_id uuid;
  v_package_id uuid;
  v_quantity numeric;
  v_memo text;
  v_case_product_id uuid;
  v_case_package_id uuid;
  v_pkg record;
  v_item record;
  v_item_qty numeric;
  v_mfr_name text;
  v_series_name text;
  v_pkg_item_count int;
  v_app_code text;
  v_app_message text;
  v_case_status text;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'FAILED',
      'error_code', 'INVALID_INPUT',
      'error_message', '入力内容が正しくありません',
      'idempotent_replay', false
    );
  END IF;

  BEGIN
    v_request_id := (payload->>'request_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_request_id := NULL;
  END;
  IF v_request_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'FAILED',
      'error_code', 'INVALID_INPUT',
      'error_message', 'リクエストを識別できません',
      'idempotent_replay', false
    );
  END IF;

  v_payload_hash := md5(payload::text);

  -- 同一 request_id の並列実行を直列化
  PERFORM pg_advisory_xact_lock(871037, hashtext(v_request_id::text));

  SELECT *
    INTO v_existing
  FROM public.case_line_append_requests
  WHERE request_id = v_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'FAILED',
        'error_code', 'REQUEST_ID_CONFLICT',
        'error_message', '同じリクエストIDで異なる内容は受け付けできません',
        'idempotent_replay', false
      );
    END IF;

    IF v_existing.status = 'COMPLETED' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'status', 'COMPLETED',
        'request_id', v_request_id,
        'case_id', v_existing.case_id,
        'case_product_id', v_existing.case_product_id,
        'case_package_id', v_existing.case_package_id,
        'line_type', COALESCE(v_existing.response->>'line_type', NULL),
        'idempotent_replay', true
      );
    ELSIF v_existing.status = 'PROCESSING' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'PROCESSING',
        'request_id', v_request_id,
        'error_code', 'LINE_ADD_FAILED',
        'error_message', '同じリクエストが処理中です',
        'idempotent_replay', false
      );
    ELSIF v_existing.status = 'FAILED' THEN
      UPDATE public.case_line_append_requests
      SET status = 'PROCESSING',
          error_code = NULL,
          error_message = NULL,
          response = NULL,
          case_id = NULL,
          case_product_id = NULL,
          case_package_id = NULL,
          completed_at = NULL,
          created_at = now()
      WHERE request_id = v_request_id;
    ELSE
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'FAILED',
        'error_code', 'LINE_ADD_FAILED',
        'error_message', '明細を追加できませんでした',
        'idempotent_replay', false
      );
    END IF;
  ELSE
    INSERT INTO public.case_line_append_requests (
      request_id, status, payload_hash
    ) VALUES (
      v_request_id, 'PROCESSING', v_payload_hash
    );
  END IF;

  BEGIN
    BEGIN
      v_case_id := (payload->>'case_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:案件IDが不正です';
    END;
    IF v_case_id IS NULL THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:案件IDが不正です';
    END IF;

    SELECT c.status
      INTO v_case_status
    FROM public.cases c
    WHERE c.id = v_case_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'APP:NOT_FOUND:案件が見つかりません';
    END IF;
    IF COALESCE(btrim(v_case_status), '') = 'キャンセル' THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:案件が無効です';
    END IF;

    IF COALESCE((payload->>'is_manual_price')::boolean, false) THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:手動価格は利用できません';
    END IF;

    v_line_type := upper(NULLIF(btrim(COALESCE(payload->>'line_type', '')), ''));
    IF v_line_type IS NULL OR v_line_type NOT IN ('PRODUCT', 'PACKAGE') THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:明細区分が正しくありません';
    END IF;

    BEGIN
      v_quantity := (payload->>'quantity')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:数量が正しくありません';
    END;
    IF v_quantity IS NULL OR v_quantity < 1 OR v_quantity > c_max_qty OR scale(v_quantity) > 0 THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:数量が正しくありません';
    END IF;

    v_memo := NULLIF(btrim(COALESCE(payload->>'memo', '')), '');
    IF v_memo IS NOT NULL AND char_length(v_memo) > c_max_str_long THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:入力値が長すぎます';
    END IF;

    v_product_id := NULL;
    v_package_id := NULL;

    IF v_line_type = 'PRODUCT' THEN
      BEGIN
        v_product_id := (payload->>'product_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:商品が正しくありません';
      END;
      IF v_product_id IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:商品が正しくありません';
      END IF;
      IF NULLIF(btrim(COALESCE(payload->>'package_id', '')), '') IS NOT NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:明細の指定が正しくありません';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.products p
        WHERE p.id = v_product_id
          AND (
            p.is_active IS NULL
            OR lower(btrim(p.is_active::text)) IN ('true', 't', '1', 'yes')
          )
      ) THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:商品が正しくありません';
      END IF;

      INSERT INTO public.case_products (
        case_id, line_type, product_id, package_id, supplier_id, quantity,
        sales_price, purchase_price, gross_profit,
        sales_price_id, purchase_price_id, is_manual_price, price_fetched_at, memo
      ) VALUES (
        v_case_id, 'PRODUCT', v_product_id, NULL, NULL, v_quantity,
        NULL, NULL, NULL,
        NULL, NULL, false, NULL, v_memo
      )
      RETURNING id INTO v_case_product_id;

      v_case_package_id := NULL;

    ELSE
      BEGIN
        v_package_id := (payload->>'package_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージが正しくありません';
      END;
      IF v_package_id IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージが正しくありません';
      END IF;
      IF NULLIF(btrim(COALESCE(payload->>'product_id', '')), '') IS NOT NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:明細の指定が正しくありません';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.packages p
        WHERE p.id = v_package_id
          AND COALESCE(p.is_active, true) = true
      ) THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージが正しくありません';
      END IF;

      SELECT count(*)::int
        INTO v_pkg_item_count
      FROM public.package_items pi
      WHERE pi.package_id = v_package_id
        AND COALESCE(pi.is_hidden, false) = false;

      IF v_pkg_item_count IS NULL OR v_pkg_item_count < 1 THEN
        RAISE EXCEPTION 'APP:PACKAGE_ITEMS_NOT_FOUND:パッケージ構成が登録されていません';
      END IF;
      IF v_pkg_item_count > c_max_pkg_items THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージ構成が上限を超えています';
      END IF;

      INSERT INTO public.case_products (
        case_id, line_type, product_id, package_id, supplier_id, quantity,
        sales_price, purchase_price, gross_profit,
        sales_price_id, purchase_price_id, is_manual_price, price_fetched_at, memo
      ) VALUES (
        v_case_id, 'PACKAGE', NULL, v_package_id, NULL, v_quantity,
        NULL, NULL, NULL,
        NULL, NULL, false, NULL, v_memo
      )
      RETURNING id INTO v_case_product_id;

      SELECT p.* INTO v_pkg FROM public.packages p WHERE p.id = v_package_id;
      v_mfr_name := NULL;
      v_series_name := NULL;
      IF v_pkg.manufacturer_id IS NOT NULL THEN
        SELECT m.name INTO v_mfr_name FROM public.manufacturers m WHERE m.id = v_pkg.manufacturer_id;
      END IF;
      IF v_pkg.series_id IS NOT NULL THEN
        SELECT s.name INTO v_series_name FROM public.product_series s WHERE s.id = v_pkg.series_id;
      END IF;

      INSERT INTO public.case_packages (
        case_id, package_id, quantity, memo, case_product_id,
        package_name_snapshot, package_code_snapshot, manufacturer_name_snapshot,
        series_name_snapshot, capacity_snapshot, capacity_unit_snapshot,
        system_type_snapshot, warranty_years_snapshot, specification_snapshot
      ) VALUES (
        v_case_id, v_package_id, v_quantity, v_memo, v_case_product_id,
        v_pkg.name, v_pkg.package_code, v_mfr_name, v_series_name,
        v_pkg.capacity, v_pkg.capacity_unit, v_pkg.system_type,
        v_pkg.warranty_years, v_pkg.specification
      )
      RETURNING id INTO v_case_package_id;

      FOR v_item IN
        SELECT pi.id AS package_item_id, pi.product_id, pi.quantity AS component_qty,
               pi.requirement_type, pi.selection_group, pi.sort_order, pi.display_name,
               pr.name AS product_name, pr.model_no, pr.product_type, pr.category,
               pr.unit, pr.specification
        FROM public.package_items pi
        LEFT JOIN public.products pr ON pr.id = pi.product_id
        WHERE pi.package_id = v_package_id
          AND COALESCE(pi.is_hidden, false) = false
        ORDER BY pi.sort_order NULLS LAST, pi.id
      LOOP
        v_item_qty := COALESCE(v_item.component_qty, 0) * v_quantity;

        INSERT INTO public.case_package_items (
          case_package_id, product_id, source_package_item_id, quantity,
          unit_purchase_price, total_purchase_price, requirement_type, selection_group,
          product_name_snapshot, model_no_snapshot, display_name_snapshot,
          product_type_snapshot, category_snapshot, unit_snapshot, specification_snapshot,
          is_selected, is_added_manually, is_hidden, sort_order
        ) VALUES (
          v_case_package_id, v_item.product_id, v_item.package_item_id, v_item_qty,
          NULL, NULL, v_item.requirement_type, v_item.selection_group,
          v_item.product_name, v_item.model_no, v_item.display_name,
          v_item.product_type, v_item.category, v_item.unit, v_item.specification,
          true, false, false, COALESCE(v_item.sort_order, 0)
        );
      END LOOP;
    END IF;

    UPDATE public.case_line_append_requests
    SET status = 'COMPLETED',
        case_id = v_case_id,
        case_product_id = v_case_product_id,
        case_package_id = v_case_package_id,
        error_code = NULL,
        error_message = NULL,
        completed_at = clock_timestamp(),
        response = jsonb_build_object(
          'case_id', v_case_id,
          'case_product_id', v_case_product_id,
          'case_package_id', v_case_package_id,
          'line_type', v_line_type,
          'request_id', v_request_id
        )
    WHERE request_id = v_request_id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'COMPLETED',
      'request_id', v_request_id,
      'case_id', v_case_id,
      'case_product_id', v_case_product_id,
      'case_package_id', v_case_package_id,
      'line_type', v_line_type,
      'idempotent_replay', false
    );

  EXCEPTION WHEN OTHERS THEN
    v_app_code := NULL;
    v_app_message := NULL;
    IF SQLERRM LIKE 'APP:%' THEN
      v_app_code := split_part(SQLERRM, ':', 2);
      v_app_message := NULLIF(btrim(substring(SQLERRM from length('APP:' || v_app_code || ':') + 1)), '');
    END IF;

    IF v_app_code IS NULL OR v_app_code NOT IN (
      'INVALID_INPUT',
      'NOT_FOUND',
      'PACKAGE_ITEMS_NOT_FOUND',
      'REQUEST_ID_CONFLICT',
      'LINE_ADD_FAILED'
    ) THEN
      v_app_code := 'LINE_ADD_FAILED';
      v_app_message := '明細を追加できませんでした';
    ELSIF v_app_message IS NULL THEN
      v_app_message := '明細を追加できませんでした';
    END IF;

    UPDATE public.case_line_append_requests
    SET status = 'FAILED',
        case_id = NULL,
        case_product_id = NULL,
        case_package_id = NULL,
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

COMMENT ON FUNCTION public.append_case_line(jsonb) IS
  '既存案件へPRODUCT/PACKAGE明細を1トランザクションで追記。価格/仕入先はNULL。冪等ledger付き。EXECUTEはservice_roleのみ。';

REVOKE ALL ON FUNCTION public.append_case_line(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.append_case_line(jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.append_case_line(jsonb) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION public.append_case_line(jsonb) FROM service_role;
    GRANT EXECUTE ON FUNCTION public.append_case_line(jsonb) TO service_role;
  END IF;
END $$;
