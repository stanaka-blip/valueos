-- Ver1.0: 案件登録トランザクション RPC（案C権限）
--
-- SECURITY: INVOKER + search_path 固定。
-- EXECUTE: service_role のみ（anon/authenticated/PUBLIC は明示REVOKE）。
-- ブラウザへ service role key を渡さないこと。PR3の呼出方式は別Phase。
--
-- payload_hash: md5(payload::text)。jsonb はキー順正規化されるため順序差を吸収。
-- 拡張不要（内蔵 md5）。
--
-- 入力上限:
--   lines: 1..100
--   quantity: 1..9999
--   PACKAGE展開後 items: 1..500（0件は拒否）
--   主要文字列: 最大500（memo等は2000）
--
-- エラー: 内部UUID/SQL/constraint/stack をレスポンスに出さない。

CREATE OR REPLACE FUNCTION public.create_case_registration(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  -- limits
  c_max_lines constant int := 100;
  c_max_qty constant numeric := 9999;
  c_max_pkg_items constant int := 500;
  c_max_str_short constant int := 500;
  c_max_str_long constant int := 2000;

  v_request_id uuid;
  v_payload_hash text;
  v_existing public.case_registration_requests%ROWTYPE;
  v_case jsonb;
  v_settlement jsonb;
  v_lines jsonb;
  v_line jsonb;
  v_dealer_id uuid;
  v_order_received_date date;
  v_settlement_type text;
  v_case_id uuid;
  v_case_no text;
  v_customer_name text;
  v_site_address text;
  v_display_names text[] := ARRAY[]::text[];
  v_qty_sum numeric := 0;
  v_line_type text;
  v_product_id uuid;
  v_package_id uuid;
  v_supplier_id uuid;
  v_quantity numeric;
  v_memo text;
  v_display_name text;
  v_sales_price_id uuid;
  v_purchase_price_id uuid;
  v_unit_sales numeric;
  v_unit_purchase numeric;
  v_sales_total numeric;
  v_purchase_total numeric;
  v_case_product_id uuid;
  v_case_package_id uuid;
  v_price_fetched_at timestamptz;
  v_pkg record;
  v_item record;
  v_item_unit numeric;
  v_item_qty numeric;
  v_item_total numeric;
  v_item_price_id uuid;
  v_mfr_name text;
  v_series_name text;
  v_product_name text;
  v_idx int;
  v_pkg_item_count int;
  v_app_code text;
  v_app_message text;
  v_tmp text;
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

  IF COALESCE((payload->>'is_manual_price')::boolean, false)
     OR COALESCE((payload->'case'->>'is_manual_price')::boolean, false)
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'FAILED',
      'error_code', 'INVALID_INPUT',
      'error_message', '手動価格は利用できません',
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

  -- jsonb::text はキー順が正規化される
  v_payload_hash := md5(payload::text);

  PERFORM pg_advisory_xact_lock(871036, hashtext(v_request_id::text));

  SELECT *
    INTO v_existing
  FROM public.case_registration_requests
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
        'case_no', COALESCE(v_existing.response->>'case_no', NULL),
        'idempotent_replay', true
      );
    ELSIF v_existing.status = 'PROCESSING' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'PROCESSING',
        'request_id', v_request_id,
        'error_code', 'REGISTRATION_FAILED',
        'error_message', '同じリクエストが処理中です',
        'idempotent_replay', false
      );
    ELSIF v_existing.status = 'FAILED' THEN
      UPDATE public.case_registration_requests
      SET status = 'PROCESSING',
          error_code = NULL,
          error_message = NULL,
          response = NULL,
          case_id = NULL,
          completed_at = NULL,
          created_at = now()
      WHERE request_id = v_request_id;
    ELSE
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'FAILED',
        'error_code', 'REGISTRATION_FAILED',
        'error_message', '登録を完了できませんでした',
        'idempotent_replay', false
      );
    END IF;
  ELSE
    INSERT INTO public.case_registration_requests (
      request_id, status, payload_hash
    ) VALUES (
      v_request_id, 'PROCESSING', v_payload_hash
    );
  END IF;

  BEGIN
    v_case := payload->'case';
    v_settlement := payload->'settlement';
    v_lines := payload->'lines';

    IF v_case IS NULL OR jsonb_typeof(v_case) <> 'object' THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:案件情報が正しくありません';
    END IF;
    IF v_settlement IS NULL OR jsonb_typeof(v_settlement) <> 'object' THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:決済情報が正しくありません';
    END IF;

    v_settlement_type := NULLIF(btrim(COALESCE(v_settlement->>'settlement_type', '')), '');
    IF v_settlement_type IS NULL OR char_length(v_settlement_type) > c_max_str_short THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:決済区分が正しくありません';
    END IF;

    IF v_lines IS NULL OR jsonb_typeof(v_lines) <> 'array' THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:明細が正しくありません';
    END IF;
    IF jsonb_array_length(v_lines) < 1 OR jsonb_array_length(v_lines) > c_max_lines THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:明細件数の上限を超えています';
    END IF;

    BEGIN
      v_dealer_id := (v_case->>'dealer_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:販売店が正しくありません';
    END;
    IF v_dealer_id IS NULL THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:販売店が正しくありません';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.dealers d
      WHERE d.id = v_dealer_id AND COALESCE(d.is_active, true) = true
    ) THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:販売店が正しくありません';
    END IF;

    BEGIN
      v_order_received_date := (v_case->>'order_received_date')::date;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:受注日が正しくありません';
    END;
    IF v_order_received_date IS NULL THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:受注日が正しくありません';
    END IF;

    v_customer_name := NULLIF(btrim(COALESCE(v_case->>'customer_name', '')), '');
    IF v_customer_name IS NULL OR char_length(v_customer_name) > c_max_str_short THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:顧客名が正しくありません';
    END IF;

    v_site_address := NULLIF(btrim(COALESCE(v_case->>'site_address', '')), '');
    IF v_site_address IS NULL OR char_length(v_site_address) > c_max_str_long THEN
      RAISE EXCEPTION 'APP:INVALID_INPUT:設置先住所が正しくありません';
    END IF;

    -- optional string length checks
    FOREACH v_tmp IN ARRAY ARRAY[
      COALESCE(v_case->>'case_no', ''),
      COALESCE(v_case->>'customer_phone', ''),
      COALESCE(v_case->>'order_type', ''),
      COALESCE(v_case->>'assigned_user', '')
    ] LOOP
      IF char_length(v_tmp) > c_max_str_short THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:入力値が長すぎます';
      END IF;
    END LOOP;
    FOREACH v_tmp IN ARRAY ARRAY[
      COALESCE(v_case->>'delivery_address', ''),
      COALESCE(v_case->>'construction_detail', ''),
      COALESCE(v_case->>'memo', '')
    ] LOOP
      IF char_length(v_tmp) > c_max_str_long THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:入力値が長すぎます';
      END IF;
    END LOOP;

    v_case_no := NULLIF(btrim(COALESCE(v_case->>'case_no', '')), '');
    IF v_case_no IS NULL THEN
      v_case_no := 'VE-' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text;
    END IF;

    FOR v_idx IN 0 .. jsonb_array_length(v_lines) - 1 LOOP
      v_line := v_lines->v_idx;
      IF v_line IS NULL OR jsonb_typeof(v_line) <> 'object' THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:明細が正しくありません';
      END IF;
      IF COALESCE((v_line->>'is_manual_price')::boolean, false) THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:手動価格は利用できません';
      END IF;

      v_line_type := upper(NULLIF(btrim(COALESCE(v_line->>'line_type', '')), ''));
      IF v_line_type IS NULL OR v_line_type NOT IN ('PRODUCT', 'PACKAGE') THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:明細区分が正しくありません';
      END IF;

      BEGIN
        v_quantity := (v_line->>'quantity')::numeric;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:数量が正しくありません';
      END;
      IF v_quantity IS NULL OR v_quantity < 1 OR v_quantity > c_max_qty OR scale(v_quantity) > 0 THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:数量が正しくありません';
      END IF;

      BEGIN
        v_supplier_id := (v_line->>'supplier_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:仕入先が正しくありません';
      END;
      IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:仕入先が正しくありません';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE s.id = v_supplier_id AND COALESCE(s.is_active, true) = true
      ) THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:仕入先が正しくありません';
      END IF;

      v_memo := NULLIF(btrim(COALESCE(v_line->>'memo', '')), '');
      IF v_memo IS NOT NULL AND char_length(v_memo) > c_max_str_long THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:入力値が長すぎます';
      END IF;
      v_display_name := NULLIF(btrim(COALESCE(v_line->>'display_name', '')), '');
      IF v_display_name IS NOT NULL AND char_length(v_display_name) > c_max_str_short THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:入力値が長すぎます';
      END IF;

      v_product_id := NULL;
      v_package_id := NULL;
      IF v_line_type = 'PRODUCT' THEN
        BEGIN
          v_product_id := (v_line->>'product_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:商品が正しくありません';
        END;
        IF v_product_id IS NULL THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:商品が正しくありません';
        END IF;
        IF NULLIF(btrim(COALESCE(v_line->>'package_id', '')), '') IS NOT NULL THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:明細の指定が正しくありません';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = v_product_id) THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:商品が正しくありません';
        END IF;
        SELECT p.name INTO v_product_name FROM public.products p WHERE p.id = v_product_id;
        v_display_name := COALESCE(v_display_name, v_product_name, '商品');
      ELSE
        BEGIN
          v_package_id := (v_line->>'package_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージが正しくありません';
        END;
        IF v_package_id IS NULL THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージが正しくありません';
        END IF;
        IF NULLIF(btrim(COALESCE(v_line->>'product_id', '')), '') IS NOT NULL THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:明細の指定が正しくありません';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.packages p WHERE p.id = v_package_id) THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:パッケージが正しくありません';
        END IF;
        SELECT p.name INTO v_product_name FROM public.packages p WHERE p.id = v_package_id;
        v_display_name := COALESCE(v_display_name, v_product_name, 'パッケージ');
      END IF;

      v_display_names := array_append(v_display_names, v_display_name);
      v_qty_sum := v_qty_sum + v_quantity;
    END LOOP;

    INSERT INTO public.cases (
      case_no, dealer_id, customer_name, customer_phone, site_address, order_type,
      product_name, quantity, order_received_date, desired_delivery_date, delivery_address,
      construction_desired_date, construction_detail, assigned_user, memo, status
    ) VALUES (
      v_case_no, v_dealer_id, v_customer_name,
      NULLIF(btrim(COALESCE(v_case->>'customer_phone', '')), ''),
      v_site_address,
      NULLIF(btrim(COALESCE(v_case->>'order_type', '')), ''),
      NULLIF(array_to_string(v_display_names, ' / '), ''),
      v_qty_sum, v_order_received_date,
      NULLIF(v_case->>'desired_delivery_date', '')::date,
      NULLIF(btrim(COALESCE(v_case->>'delivery_address', '')), ''),
      NULLIF(v_case->>'construction_desired_date', '')::date,
      NULLIF(btrim(COALESCE(v_case->>'construction_detail', '')), ''),
      NULLIF(btrim(COALESCE(v_case->>'assigned_user', '')), ''),
      NULLIF(btrim(COALESCE(v_case->>'memo', '')), ''),
      '新規受付'
    )
    RETURNING id INTO v_case_id;

    INSERT INTO public.case_settlements (case_id, settlement_type, fee_amount)
    VALUES (v_case_id, v_settlement_type, 0);

    v_price_fetched_at := clock_timestamp();

    FOR v_idx IN 0 .. jsonb_array_length(v_lines) - 1 LOOP
      v_line := v_lines->v_idx;
      v_line_type := upper(btrim(v_line->>'line_type'));
      v_quantity := (v_line->>'quantity')::numeric;
      v_supplier_id := (v_line->>'supplier_id')::uuid;
      v_memo := NULLIF(btrim(COALESCE(v_line->>'memo', '')), '');
      v_product_id := NULL;
      v_package_id := NULL;
      v_sales_price_id := NULL;
      v_purchase_price_id := NULL;
      v_unit_sales := NULL;
      v_unit_purchase := NULL;

      IF v_line_type = 'PRODUCT' THEN
        v_product_id := (v_line->>'product_id')::uuid;

        SELECT sp.id, sp.sales_price
          INTO v_sales_price_id, v_unit_sales
        FROM public.sales_prices sp
        WHERE sp.dealer_id = v_dealer_id
          AND sp.is_active = true
          AND sp.price_target_type = 'PRODUCT'
          AND sp.product_id = v_product_id
          AND sp.start_date <= v_order_received_date
          AND (sp.end_date IS NULL OR sp.end_date >= v_order_received_date)
        ORDER BY sp.start_date DESC
        LIMIT 1;

        IF v_sales_price_id IS NULL OR COALESCE(v_unit_sales, 0) <= 0 THEN
          RAISE EXCEPTION 'APP:PRICE_NOT_FOUND:価格が見つかりません';
        END IF;

        SELECT pp.id, pp.purchase_price
          INTO v_purchase_price_id, v_unit_purchase
        FROM public.purchase_prices pp
        WHERE pp.supplier_id = v_supplier_id
          AND pp.is_active = true
          AND pp.price_target_type = 'PRODUCT'
          AND pp.product_id = v_product_id
          AND pp.start_date <= v_order_received_date
          AND (pp.end_date IS NULL OR pp.end_date >= v_order_received_date)
        ORDER BY pp.start_date DESC
        LIMIT 1;

        IF v_purchase_price_id IS NULL OR COALESCE(v_unit_purchase, 0) <= 0 THEN
          RAISE EXCEPTION 'APP:PRICE_NOT_FOUND:価格が見つかりません';
        END IF;

        v_sales_total := ROUND(v_unit_sales * v_quantity);
        v_purchase_total := ROUND(v_unit_purchase * v_quantity);

        INSERT INTO public.case_products (
          case_id, line_type, product_id, package_id, supplier_id, quantity,
          sales_price, purchase_price, gross_profit,
          sales_price_id, purchase_price_id, is_manual_price, price_fetched_at, memo
        ) VALUES (
          v_case_id, 'PRODUCT', v_product_id, NULL, v_supplier_id, v_quantity,
          v_sales_total, v_purchase_total, v_sales_total - v_purchase_total,
          v_sales_price_id, v_purchase_price_id, false, v_price_fetched_at, v_memo
        );

      ELSE
        v_package_id := (v_line->>'package_id')::uuid;

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

        SELECT sp.id, sp.sales_price
          INTO v_sales_price_id, v_unit_sales
        FROM public.sales_prices sp
        WHERE sp.dealer_id = v_dealer_id
          AND sp.is_active = true
          AND sp.price_target_type = 'PACKAGE'
          AND sp.package_id = v_package_id
          AND sp.start_date <= v_order_received_date
          AND (sp.end_date IS NULL OR sp.end_date >= v_order_received_date)
        ORDER BY sp.start_date DESC
        LIMIT 1;

        IF v_sales_price_id IS NULL OR COALESCE(v_unit_sales, 0) <= 0 THEN
          RAISE EXCEPTION 'APP:PRICE_NOT_FOUND:価格が見つかりません';
        END IF;

        SELECT pp.id, pp.purchase_price
          INTO v_purchase_price_id, v_unit_purchase
        FROM public.purchase_prices pp
        WHERE pp.supplier_id = v_supplier_id
          AND pp.is_active = true
          AND pp.price_target_type = 'PACKAGE'
          AND pp.package_id = v_package_id
          AND pp.start_date <= v_order_received_date
          AND (pp.end_date IS NULL OR pp.end_date >= v_order_received_date)
        ORDER BY pp.start_date DESC
        LIMIT 1;

        IF v_purchase_price_id IS NULL OR COALESCE(v_unit_purchase, 0) <= 0 THEN
          RAISE EXCEPTION 'APP:PRICE_NOT_FOUND:価格が見つかりません';
        END IF;

        FOR v_item IN
          SELECT pi.id AS package_item_id, pi.product_id
          FROM public.package_items pi
          WHERE pi.package_id = v_package_id
            AND COALESCE(pi.is_hidden, false) = false
        LOOP
          IF v_item.product_id IS NULL THEN
            RAISE EXCEPTION 'APP:PACKAGE_ITEM_PRICE_NOT_FOUND:構成商品の価格が見つかりません';
          END IF;
          SELECT pp.id, pp.purchase_price
            INTO v_item_price_id, v_item_unit
          FROM public.purchase_prices pp
          WHERE pp.supplier_id = v_supplier_id
            AND pp.is_active = true
            AND pp.price_target_type = 'PRODUCT'
            AND pp.product_id = v_item.product_id
            AND pp.start_date <= v_order_received_date
            AND (pp.end_date IS NULL OR pp.end_date >= v_order_received_date)
          ORDER BY pp.start_date DESC
          LIMIT 1;
          IF v_item_price_id IS NULL OR COALESCE(v_item_unit, 0) <= 0 THEN
            RAISE EXCEPTION 'APP:PACKAGE_ITEM_PRICE_NOT_FOUND:構成商品の価格が見つかりません';
          END IF;
        END LOOP;

        v_sales_total := ROUND(v_unit_sales * v_quantity);
        v_purchase_total := ROUND(v_unit_purchase * v_quantity);

        INSERT INTO public.case_products (
          case_id, line_type, product_id, package_id, supplier_id, quantity,
          sales_price, purchase_price, gross_profit,
          sales_price_id, purchase_price_id, is_manual_price, price_fetched_at, memo
        ) VALUES (
          v_case_id, 'PACKAGE', NULL, v_package_id, v_supplier_id, v_quantity,
          v_sales_total, v_purchase_total, v_sales_total - v_purchase_total,
          v_sales_price_id, v_purchase_price_id, false, v_price_fetched_at, v_memo
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
          SELECT pp.purchase_price
            INTO v_item_unit
          FROM public.purchase_prices pp
          WHERE pp.supplier_id = v_supplier_id
            AND pp.is_active = true
            AND pp.price_target_type = 'PRODUCT'
            AND pp.product_id = v_item.product_id
            AND pp.start_date <= v_order_received_date
            AND (pp.end_date IS NULL OR pp.end_date >= v_order_received_date)
          ORDER BY pp.start_date DESC
          LIMIT 1;

          v_item_qty := COALESCE(v_item.component_qty, 0) * v_quantity;
          v_item_total := ROUND(COALESCE(v_item_unit, 0) * v_item_qty);

          INSERT INTO public.case_package_items (
            case_package_id, product_id, source_package_item_id, quantity,
            unit_purchase_price, total_purchase_price, requirement_type, selection_group,
            product_name_snapshot, model_no_snapshot, display_name_snapshot,
            product_type_snapshot, category_snapshot, unit_snapshot, specification_snapshot,
            is_selected, is_added_manually, is_hidden, sort_order
          ) VALUES (
            v_case_package_id, v_item.product_id, v_item.package_item_id, v_item_qty,
            v_item_unit, v_item_total, v_item.requirement_type, v_item.selection_group,
            v_item.product_name, v_item.model_no, v_item.display_name,
            v_item.product_type, v_item.category, v_item.unit, v_item.specification,
            true, false, false, COALESCE(v_item.sort_order, 0)
          );
        END LOOP;
      END IF;
    END LOOP;

    UPDATE public.case_registration_requests
    SET status = 'COMPLETED',
        case_id = v_case_id,
        error_code = NULL,
        error_message = NULL,
        completed_at = clock_timestamp(),
        response = jsonb_build_object(
          'case_id', v_case_id,
          'case_no', v_case_no,
          'request_id', v_request_id
        )
    WHERE request_id = v_request_id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'COMPLETED',
      'request_id', v_request_id,
      'case_id', v_case_id,
      'case_no', v_case_no,
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
      'PRICE_NOT_FOUND',
      'PACKAGE_ITEMS_NOT_FOUND',
      'PACKAGE_ITEM_PRICE_NOT_FOUND',
      'REQUEST_ID_CONFLICT',
      'REGISTRATION_FAILED'
    ) THEN
      v_app_code := 'REGISTRATION_FAILED';
      v_app_message := '登録を完了できませんでした';
    ELSIF v_app_message IS NULL THEN
      v_app_message := '登録を完了できませんでした';
    END IF;

    UPDATE public.case_registration_requests
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
  END;
END;
$$;

COMMENT ON FUNCTION public.create_case_registration(jsonb) IS
  '案件登録RPC。案C: EXECUTEはservice_roleのみ。価格はDB再取得。構成0件PACKAGEは拒否。';

REVOKE ALL ON FUNCTION public.create_case_registration(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.create_case_registration(jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.create_case_registration(jsonb) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION public.create_case_registration(jsonb) FROM service_role;
    GRANT EXECUTE ON FUNCTION public.create_case_registration(jsonb) TO service_role;
  END IF;
END $$;
