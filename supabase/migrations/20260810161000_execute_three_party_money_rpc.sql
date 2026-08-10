-- PR2 fix: 3社間金銭アクションを単一 RPC トランザクションで実行
-- - 訂正（新行作成 + 元取消）を atomic に
-- - ledger 完了も同一 tx（PROCESSING 取り残しを防ぐ）
-- - EXECUTE は service_role のみ
-- Additive only。既存 invoices/payments は変更しない。

CREATE OR REPLACE FUNCTION public.execute_three_party_money(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request_id uuid;
  v_payload_hash text;
  v_existing public.three_party_money_requests%ROWTYPE;
  v_action text;
  v_case_id uuid;
  v_resource_id uuid;
  v_new_id uuid;
  v_status text;
  v_case_dealer_id uuid;
  v_src record;
  v_fr record;
  v_inv record;
  v_ord record;
  v_line jsonb;
  v_i int;
  v_kind text;
  v_desc text;
  v_amt numeric;
  v_memo text;
  v_sort int;
  v_credit numeric;
  v_ve numeric;
  v_adj numeric;
  v_payout numeric;
  v_app_code text;
  v_app_message text;
  v_response jsonb;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RETURN jsonb_build_object(
      'ok', false, 'status', 'FAILED',
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
      'ok', false, 'status', 'FAILED',
      'error_code', 'INVALID_INPUT',
      'error_message', 'リクエストを識別できません',
      'idempotent_replay', false
    );
  END IF;

  v_action := nullif(btrim(COALESCE(payload->>'action', '')), '');
  IF v_action IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'status', 'FAILED',
      'error_code', 'INVALID_INPUT',
      'error_message', 'アクションが不正です',
      'idempotent_replay', false
    );
  END IF;

  v_payload_hash := md5(payload::text);

  -- 同一 request_id を直列化
  PERFORM pg_advisory_xact_lock(871138, hashtext(v_request_id::text));

  SELECT * INTO v_existing
  FROM public.three_party_money_requests
  WHERE request_id = v_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RETURN jsonb_build_object(
        'ok', false, 'status', 'FAILED',
        'error_code', 'REQUEST_ID_CONFLICT',
        'error_message', '同じ Idempotency-Key で異なる内容は実行できません',
        'request_id', v_request_id,
        'idempotent_replay', false
      );
    END IF;

    IF v_existing.status = 'COMPLETED' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'status', 'COMPLETED',
        'request_id', v_request_id,
        'action', v_action,
        'case_id', v_existing.case_id,
        'resource_id', v_existing.resource_id,
        'resource_status', COALESCE(v_existing.response->>'status', 'COMPLETED'),
        'idempotent_replay', true
      );
    ELSIF v_existing.status = 'PROCESSING' THEN
      RETURN jsonb_build_object(
        'ok', false, 'status', 'PROCESSING',
        'error_code', 'REQUEST_IN_PROGRESS',
        'error_message', '同じリクエストが処理中です',
        'request_id', v_request_id,
        'idempotent_replay', false
      );
    ELSIF v_existing.status = 'FAILED' THEN
      UPDATE public.three_party_money_requests
      SET status = 'PROCESSING',
          error_code = NULL,
          error_message = NULL,
          response = NULL,
          resource_id = NULL,
          completed_at = NULL,
          action = v_action
      WHERE request_id = v_request_id;
    ELSE
      RETURN jsonb_build_object(
        'ok', false, 'status', 'FAILED',
        'error_code', 'ACTION_FAILED',
        'error_message', '処理に失敗しました',
        'request_id', v_request_id,
        'idempotent_replay', false
      );
    END IF;
  ELSE
    INSERT INTO public.three_party_money_requests (
      request_id, action, status, payload_hash
    ) VALUES (
      v_request_id, v_action, 'PROCESSING', v_payload_hash
    );
  END IF;

  BEGIN
    -- ---------------- helpers via nested blocks per action ----------------
    IF v_action = 'finance_receipt.create' THEN
      BEGIN
        v_case_id := (payload->>'case_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:案件IDが不正です';
      END;
      IF NOT EXISTS (SELECT 1 FROM public.cases c WHERE c.id = v_case_id) THEN
        RAISE EXCEPTION 'APP:NOT_FOUND:案件が見つかりません';
      END IF;
      IF nullif(btrim(COALESCE(payload->>'finance_company', '')), '') IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:信販会社は必須です';
      END IF;
      v_credit := floor(COALESCE((payload->>'scheduled_amount')::numeric, -1));
      IF v_credit IS NULL OR v_credit < 0 THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:予定金額が不正です';
      END IF;

      INSERT INTO public.finance_receipts (
        case_id, finance_company, scheduled_date, scheduled_amount, status, memo
      ) VALUES (
        v_case_id,
        btrim(payload->>'finance_company'),
        NULLIF(btrim(COALESCE(payload->>'scheduled_date', '')), '')::date,
        v_credit,
        '予定',
        NULLIF(btrim(COALESCE(payload->>'memo', '')), '')
      )
      RETURNING id, status INTO v_new_id, v_status;

    ELSIF v_action = 'finance_receipt.confirm' THEN
      BEGIN
        v_resource_id := (payload->>'resource_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:対象IDが不正です';
      END;
      SELECT * INTO v_src FROM public.finance_receipts WHERE id = v_resource_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'APP:NOT_FOUND:信販入金が見つかりません';
      END IF;
      IF v_src.status = '取消' THEN
        RAISE EXCEPTION 'APP:CONFLICT:取消済みの入金は確定できません';
      END IF;
      IF v_src.status = '入金済' THEN
        RAISE EXCEPTION 'APP:IMMUTABLE:すでに入金済です。訂正してください';
      END IF;
      v_credit := floor(COALESCE((payload->>'actual_amount')::numeric, -1));
      IF v_credit IS NULL OR v_credit < 0 THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:実入金額が不正です';
      END IF;
      IF nullif(btrim(COALESCE(payload->>'actual_date', '')), '') IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:実入金日は必須です';
      END IF;

      UPDATE public.finance_receipts
      SET actual_date = (payload->>'actual_date')::date,
          actual_amount = v_credit,
          status = '入金済',
          memo = COALESCE(NULLIF(btrim(COALESCE(payload->>'memo', '')), ''), memo)
      WHERE id = v_resource_id AND status = '予定'
      RETURNING id, case_id, status INTO v_new_id, v_case_id, v_status;
      IF v_new_id IS NULL THEN
        RAISE EXCEPTION 'APP:CONFLICT:入金確定に失敗しました';
      END IF;

    ELSIF v_action = 'finance_receipt.cancel' THEN
      BEGIN
        v_resource_id := (payload->>'resource_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:対象IDが不正です';
      END;
      SELECT * INTO v_src FROM public.finance_receipts WHERE id = v_resource_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'APP:NOT_FOUND:信販入金が見つかりません';
      END IF;
      IF v_src.status = '取消' THEN
        RAISE EXCEPTION 'APP:CONFLICT:すでに取消済みです';
      END IF;
      UPDATE public.finance_receipts
      SET status = '取消',
          cancelled_at = now(),
          cancel_reason = NULLIF(btrim(COALESCE(payload->>'cancel_reason', '')), '')
      WHERE id = v_resource_id
      RETURNING id, case_id, status INTO v_new_id, v_case_id, v_status;

    ELSIF v_action = 'finance_receipt.correct' THEN
      -- atomic: 新行 INSERT + 元行 取消
      BEGIN
        v_resource_id := (payload->>'resource_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:対象IDが不正です';
      END;
      SELECT * INTO v_src FROM public.finance_receipts WHERE id = v_resource_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'APP:NOT_FOUND:信販入金が見つかりません';
      END IF;
      IF v_src.status = '取消' THEN
        RAISE EXCEPTION 'APP:CONFLICT:取消済みは訂正できません';
      END IF;
      v_case_id := v_src.case_id;
      IF nullif(btrim(COALESCE(payload->>'finance_company', '')), '') IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:信販会社は必須です';
      END IF;
      v_credit := floor(COALESCE((payload->>'scheduled_amount')::numeric, -1));
      IF v_credit IS NULL OR v_credit < 0 THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:予定金額が不正です';
      END IF;

      INSERT INTO public.finance_receipts (
        case_id, finance_company, scheduled_date, scheduled_amount, status, memo, corrects_id
      ) VALUES (
        v_case_id,
        btrim(payload->>'finance_company'),
        NULLIF(btrim(COALESCE(payload->>'scheduled_date', '')), '')::date,
        v_credit,
        '予定',
        NULLIF(btrim(COALESCE(payload->>'memo', '')), ''),
        v_resource_id
      )
      RETURNING id, status INTO v_new_id, v_status;

      UPDATE public.finance_receipts
      SET status = '取消',
          cancelled_at = now(),
          cancel_reason = COALESCE(
            NULLIF(btrim(COALESCE(payload->>'cancel_reason', '')), ''),
            '訂正のため取消'
          )
      WHERE id = v_resource_id AND status <> '取消';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'APP:CONFLICT:元レコードの取消に失敗しました';
      END IF;

    ELSIF v_action IN ('dealer_settlement.create', 'dealer_settlement.correct') THEN
      IF v_action = 'dealer_settlement.correct' THEN
        BEGIN
          v_resource_id := (payload->>'resource_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:対象IDが不正です';
        END;
        SELECT * INTO v_src FROM public.dealer_settlements WHERE id = v_resource_id FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'APP:NOT_FOUND:仕切清算が見つかりません';
        END IF;
        IF v_src.status = '取消' THEN
          RAISE EXCEPTION 'APP:CONFLICT:取消済みは訂正できません';
        END IF;
        v_case_id := v_src.case_id;
      ELSE
        BEGIN
          v_case_id := (payload->>'case_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:案件IDが不正です';
        END;
        v_resource_id := NULL;
      END IF;

      SELECT c.dealer_id INTO v_case_dealer_id
      FROM public.cases c WHERE c.id = v_case_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'APP:NOT_FOUND:案件が見つかりません';
      END IF;

      BEGIN
        IF (payload->>'dealer_id')::uuid IS NULL THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:販売店IDが不正です';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:販売店IDが不正です';
      END;

      IF v_case_dealer_id IS NOT NULL
         AND v_case_dealer_id IS DISTINCT FROM (payload->>'dealer_id')::uuid THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:販売店が案件と一致しません';
      END IF;

      IF payload ? 'finance_receipt_id'
         AND nullif(btrim(COALESCE(payload->>'finance_receipt_id', '')), '') IS NOT NULL THEN
        SELECT * INTO v_fr FROM public.finance_receipts
        WHERE id = (payload->>'finance_receipt_id')::uuid;
        IF NOT FOUND OR v_fr.case_id IS DISTINCT FROM v_case_id THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:信販入金が案件と一致しません';
        END IF;
        IF v_fr.status = '取消' THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:取消済みの信販入金は参照できません';
        END IF;
      END IF;

      IF payload ? 'invoice_id'
         AND nullif(btrim(COALESCE(payload->>'invoice_id', '')), '') IS NOT NULL THEN
        SELECT * INTO v_inv FROM public.invoices
        WHERE id = (payload->>'invoice_id')::uuid;
        IF NOT FOUND OR v_inv.case_id IS DISTINCT FROM v_case_id THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:請求が案件と一致しません';
        END IF;
      END IF;

      v_credit := floor(COALESCE((payload->>'credit_received_amount')::numeric, -1));
      v_ve := floor(COALESCE((payload->>'ve_share_amount')::numeric, -1));
      IF v_credit IS NULL OR v_credit < 0 OR v_ve IS NULL OR v_ve < 0 THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:金額が不正です';
      END IF;

      v_adj := 0;
      IF payload ? 'lines' AND jsonb_typeof(payload->'lines') = 'array' THEN
        FOR v_i IN 0 .. jsonb_array_length(payload->'lines') - 1 LOOP
          v_line := payload->'lines'->v_i;
          v_kind := btrim(COALESCE(v_line->>'line_kind', ''));
          IF v_kind IN ('transfer_fee', 'discount', 'offset', 'other') THEN
            v_amt := floor(COALESCE((v_line->>'amount')::numeric, -1));
            IF v_amt IS NULL OR v_amt < 0 THEN
              RAISE EXCEPTION 'APP:INVALID_INPUT:調整金額が不正です';
            END IF;
            v_adj := v_adj + v_amt;
          ELSIF v_kind IN ('credit_in', 've_share') THEN
            v_amt := floor(COALESCE((v_line->>'amount')::numeric, -1));
            IF v_amt IS NULL OR v_amt < 0 THEN
              RAISE EXCEPTION 'APP:INVALID_INPUT:明細金額が不正です';
            END IF;
          ELSIF v_kind <> '' THEN
            RAISE EXCEPTION 'APP:INVALID_INPUT:明細種別が不正です';
          END IF;
        END LOOP;
      END IF;

      v_payout := v_credit - v_ve - v_adj;
      IF v_payout < 0 THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:振込額が負になります';
      END IF;

      INSERT INTO public.dealer_settlements (
        case_id, dealer_id, statement_no, issue_date,
        finance_receipt_id, invoice_id,
        credit_received_amount, ve_share_amount, adjustment_total_amount, payout_amount,
        scheduled_payout_date, contract_date, delivery_date,
        status, memo, corrects_id
      ) VALUES (
        v_case_id,
        (payload->>'dealer_id')::uuid,
        NULLIF(btrim(COALESCE(payload->>'statement_no', '')), ''),
        NULLIF(btrim(COALESCE(payload->>'issue_date', '')), '')::date,
        NULLIF(btrim(COALESCE(payload->>'finance_receipt_id', '')), '')::uuid,
        NULLIF(btrim(COALESCE(payload->>'invoice_id', '')), '')::uuid,
        v_credit, v_ve, v_adj, v_payout,
        NULLIF(btrim(COALESCE(payload->>'scheduled_payout_date', '')), '')::date,
        NULLIF(btrim(COALESCE(payload->>'contract_date', '')), '')::date,
        NULLIF(btrim(COALESCE(payload->>'delivery_date', '')), '')::date,
        '下書き',
        NULLIF(btrim(COALESCE(payload->>'memo', '')), ''),
        CASE WHEN v_action = 'dealer_settlement.correct' THEN v_resource_id ELSE NULL END
      )
      RETURNING id, status INTO v_new_id, v_status;

      IF payload ? 'lines' AND jsonb_typeof(payload->'lines') = 'array' THEN
        FOR v_i IN 0 .. jsonb_array_length(payload->'lines') - 1 LOOP
          v_line := payload->'lines'->v_i;
          v_kind := btrim(COALESCE(v_line->>'line_kind', ''));
          v_desc := nullif(btrim(COALESCE(v_line->>'description', '')), '');
          v_amt := floor(COALESCE((v_line->>'amount')::numeric, 0));
          v_memo := NULLIF(btrim(COALESCE(v_line->>'memo', '')), '');
          v_sort := COALESCE((v_line->>'sort_order')::int, v_i + 1);
          IF v_desc IS NULL THEN
            RAISE EXCEPTION 'APP:INVALID_INPUT:品名/摘要は必須です';
          END IF;
          INSERT INTO public.dealer_settlement_lines (
            dealer_settlement_id, sort_order, line_kind, description, amount, memo
          ) VALUES (
            v_new_id, v_sort, v_kind, v_desc, v_amt, v_memo
          );
        END LOOP;
      END IF;

      IF v_action = 'dealer_settlement.correct' THEN
        UPDATE public.dealer_settlements
        SET status = '取消',
            cancelled_at = now(),
            cancel_reason = COALESCE(
              NULLIF(btrim(COALESCE(payload->>'cancel_reason', '')), ''),
              '訂正のため取消'
            )
        WHERE id = v_resource_id AND status <> '取消';
        IF NOT FOUND THEN
          RAISE EXCEPTION 'APP:CONFLICT:元レコードの取消に失敗しました';
        END IF;
      END IF;

    ELSIF v_action = 'dealer_settlement.confirm' THEN
      BEGIN
        v_resource_id := (payload->>'resource_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:対象IDが不正です';
      END;
      SELECT * INTO v_src FROM public.dealer_settlements WHERE id = v_resource_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'APP:NOT_FOUND:仕切清算が見つかりません';
      END IF;
      IF v_src.status = '取消' THEN
        RAISE EXCEPTION 'APP:CONFLICT:取消済みは確定できません';
      END IF;
      IF v_src.status IN ('確定', '支払済') THEN
        RAISE EXCEPTION 'APP:IMMUTABLE:確定済みの金額は変更できません。訂正してください';
      END IF;
      -- snapshot 金額は再計算UPDATE しない
      UPDATE public.dealer_settlements
      SET status = '確定'
      WHERE id = v_resource_id AND status = '下書き'
      RETURNING id, case_id, status INTO v_new_id, v_case_id, v_status;
      IF v_new_id IS NULL THEN
        RAISE EXCEPTION 'APP:CONFLICT:確定に失敗しました';
      END IF;

    ELSIF v_action = 'dealer_settlement.pay' THEN
      BEGIN
        v_resource_id := (payload->>'resource_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:対象IDが不正です';
      END;
      SELECT * INTO v_src FROM public.dealer_settlements WHERE id = v_resource_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'APP:NOT_FOUND:仕切清算が見つかりません';
      END IF;
      IF v_src.status = '取消' THEN
        RAISE EXCEPTION 'APP:CONFLICT:取消済みには支払登録できません';
      END IF;
      IF v_src.status = '下書き' THEN
        RAISE EXCEPTION 'APP:CONFLICT:先に確定してください';
      END IF;
      IF v_src.status = '支払済' THEN
        RAISE EXCEPTION 'APP:IMMUTABLE:すでに支払済です。訂正してください';
      END IF;
      v_credit := floor(COALESCE((payload->>'actual_payout_amount')::numeric, -1));
      IF v_credit IS NULL OR v_credit < 0 THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:実支払額が不正です';
      END IF;
      IF nullif(btrim(COALESCE(payload->>'actual_payout_date', '')), '') IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:実支払日は必須です';
      END IF;
      UPDATE public.dealer_settlements
      SET actual_payout_date = (payload->>'actual_payout_date')::date,
          actual_payout_amount = v_credit,
          status = '支払済',
          memo = COALESCE(NULLIF(btrim(COALESCE(payload->>'memo', '')), ''), memo)
      WHERE id = v_resource_id AND status = '確定'
      RETURNING id, case_id, status INTO v_new_id, v_case_id, v_status;
      IF v_new_id IS NULL THEN
        RAISE EXCEPTION 'APP:CONFLICT:支払登録に失敗しました';
      END IF;

    ELSIF v_action = 'dealer_settlement.cancel' THEN
      BEGIN
        v_resource_id := (payload->>'resource_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:対象IDが不正です';
      END;
      SELECT * INTO v_src FROM public.dealer_settlements WHERE id = v_resource_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'APP:NOT_FOUND:仕切清算が見つかりません';
      END IF;
      IF v_src.status = '取消' THEN
        RAISE EXCEPTION 'APP:CONFLICT:すでに取消済みです';
      END IF;
      UPDATE public.dealer_settlements
      SET status = '取消',
          cancelled_at = now(),
          cancel_reason = NULLIF(btrim(COALESCE(payload->>'cancel_reason', '')), '')
      WHERE id = v_resource_id
      RETURNING id, case_id, status INTO v_new_id, v_case_id, v_status;

    ELSIF v_action IN ('supplier_payment.create', 'supplier_payment.correct') THEN
      -- 信販入金完了は前提にしない
      IF v_action = 'supplier_payment.correct' THEN
        BEGIN
          v_resource_id := (payload->>'resource_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:対象IDが不正です';
        END;
        SELECT * INTO v_src FROM public.supplier_payments WHERE id = v_resource_id FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'APP:NOT_FOUND:仕入先支払が見つかりません';
        END IF;
        IF v_src.status = '取消' THEN
          RAISE EXCEPTION 'APP:CONFLICT:取消済みは訂正できません';
        END IF;
        v_case_id := v_src.case_id;
      ELSE
        BEGIN
          v_case_id := (payload->>'case_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:案件IDが不正です';
        END;
        IF NOT EXISTS (SELECT 1 FROM public.cases c WHERE c.id = v_case_id) THEN
          RAISE EXCEPTION 'APP:NOT_FOUND:案件が見つかりません';
        END IF;
        v_resource_id := NULL;
      END IF;

      BEGIN
        IF (payload->>'supplier_id')::uuid IS NULL THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:仕入先IDが不正です';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:仕入先IDが不正です';
      END;

      IF payload ? 'order_id'
         AND nullif(btrim(COALESCE(payload->>'order_id', '')), '') IS NOT NULL THEN
        SELECT * INTO v_ord FROM public.orders
        WHERE id = (payload->>'order_id')::uuid;
        IF NOT FOUND OR v_ord.case_id IS DISTINCT FROM v_case_id THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:発注が案件と一致しません';
        END IF;
        IF v_ord.supplier_id IS NOT NULL
           AND v_ord.supplier_id IS DISTINCT FROM (payload->>'supplier_id')::uuid THEN
          RAISE EXCEPTION 'APP:INVALID_INPUT:発注の仕入先と一致しません';
        END IF;
      END IF;

      v_credit := floor(COALESCE((payload->>'scheduled_amount')::numeric, -1));
      IF v_credit IS NULL OR v_credit < 0 THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:支払予定額が不正です';
      END IF;

      INSERT INTO public.supplier_payments (
        case_id, supplier_id, order_id, due_date, scheduled_amount, status, memo, corrects_id
      ) VALUES (
        v_case_id,
        (payload->>'supplier_id')::uuid,
        NULLIF(btrim(COALESCE(payload->>'order_id', '')), '')::uuid,
        NULLIF(btrim(COALESCE(payload->>'due_date', '')), '')::date,
        v_credit,
        '予定',
        NULLIF(btrim(COALESCE(payload->>'memo', '')), ''),
        CASE WHEN v_action = 'supplier_payment.correct' THEN v_resource_id ELSE NULL END
      )
      RETURNING id, status INTO v_new_id, v_status;

      IF v_action = 'supplier_payment.correct' THEN
        UPDATE public.supplier_payments
        SET status = '取消',
            cancelled_at = now(),
            cancel_reason = COALESCE(
              NULLIF(btrim(COALESCE(payload->>'cancel_reason', '')), ''),
              '訂正のため取消'
            )
        WHERE id = v_resource_id AND status <> '取消';
        IF NOT FOUND THEN
          RAISE EXCEPTION 'APP:CONFLICT:元レコードの取消に失敗しました';
        END IF;
      END IF;

    ELSIF v_action = 'supplier_payment.pay' THEN
      BEGIN
        v_resource_id := (payload->>'resource_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:対象IDが不正です';
      END;
      SELECT * INTO v_src FROM public.supplier_payments WHERE id = v_resource_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'APP:NOT_FOUND:仕入先支払が見つかりません';
      END IF;
      IF v_src.status = '取消' THEN
        RAISE EXCEPTION 'APP:CONFLICT:取消済みには支払登録できません';
      END IF;
      IF v_src.status = '支払済' THEN
        RAISE EXCEPTION 'APP:IMMUTABLE:すでに支払済です。訂正してください';
      END IF;
      v_credit := floor(COALESCE((payload->>'paid_amount')::numeric, -1));
      IF v_credit IS NULL OR v_credit < 0 THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:実支払額が不正です';
      END IF;
      IF nullif(btrim(COALESCE(payload->>'paid_date', '')), '') IS NULL THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:実支払日は必須です';
      END IF;
      UPDATE public.supplier_payments
      SET paid_date = (payload->>'paid_date')::date,
          paid_amount = v_credit,
          status = '支払済',
          memo = COALESCE(NULLIF(btrim(COALESCE(payload->>'memo', '')), ''), memo)
      WHERE id = v_resource_id AND status = '予定'
      RETURNING id, case_id, status INTO v_new_id, v_case_id, v_status;
      IF v_new_id IS NULL THEN
        RAISE EXCEPTION 'APP:CONFLICT:支払登録に失敗しました';
      END IF;

    ELSIF v_action = 'supplier_payment.cancel' THEN
      BEGIN
        v_resource_id := (payload->>'resource_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'APP:INVALID_INPUT:対象IDが不正です';
      END;
      SELECT * INTO v_src FROM public.supplier_payments WHERE id = v_resource_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'APP:NOT_FOUND:仕入先支払が見つかりません';
      END IF;
      IF v_src.status = '取消' THEN
        RAISE EXCEPTION 'APP:CONFLICT:すでに取消済みです';
      END IF;
      UPDATE public.supplier_payments
      SET status = '取消',
          cancelled_at = now(),
          cancel_reason = NULLIF(btrim(COALESCE(payload->>'cancel_reason', '')), '')
      WHERE id = v_resource_id
      RETURNING id, case_id, status INTO v_new_id, v_case_id, v_status;

    ELSE
      RAISE EXCEPTION 'APP:INVALID_INPUT:アクションが不正です';
    END IF;

    IF v_case_id IS NULL AND v_new_id IS NOT NULL THEN
      -- ensure case_id for create paths that set it earlier
      NULL;
    END IF;

    v_response := jsonb_build_object(
      'status', v_status,
      'resource_id', v_new_id,
      'case_id', v_case_id,
      'action', v_action
    );

    UPDATE public.three_party_money_requests
    SET status = 'COMPLETED',
        case_id = v_case_id,
        resource_id = v_new_id,
        response = v_response,
        completed_at = now(),
        error_code = NULL,
        error_message = NULL
    WHERE request_id = v_request_id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'COMPLETED',
      'request_id', v_request_id,
      'action', v_action,
      'case_id', v_case_id,
      'resource_id', v_new_id,
      'resource_status', v_status,
      'idempotent_replay', false
    );

  EXCEPTION WHEN OTHERS THEN
    v_app_message := SQLERRM;
    IF v_app_message LIKE 'APP:%' THEN
      v_app_code := split_part(v_app_message, ':', 2);
      v_app_message := substr(v_app_message, length('APP:' || v_app_code || ':') + 1);
    ELSE
      v_app_code := 'ACTION_FAILED';
      v_app_message := '処理に失敗しました';
    END IF;

    UPDATE public.three_party_money_requests
    SET status = 'FAILED',
        error_code = v_app_code,
        error_message = left(v_app_message, 200),
        completed_at = now()
    WHERE request_id = v_request_id;

    RETURN jsonb_build_object(
      'ok', false,
      'status', 'FAILED',
      'request_id', v_request_id,
      'error_code', v_app_code,
      'error_message', left(v_app_message, 200),
      'idempotent_replay', false
    );
  END;
END;
$$;

COMMENT ON FUNCTION public.execute_three_party_money(jsonb) IS
  '3社間金銭イベント API。ledger + 業務を同一トランザクションで実行。訂正は新行+元取消が atomic。';

REVOKE ALL ON FUNCTION public.execute_three_party_money(jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.execute_three_party_money(jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.execute_three_party_money(jsonb) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.execute_three_party_money(jsonb) TO service_role;
  END IF;
END $$;
