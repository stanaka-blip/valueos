-- 未使用パッケージの原子削除 RPC（delete_unused_package）
--
-- 目的:
-- - package_items DELETE と packages DELETE を同一トランザクションで実行
-- - 途中失敗時は両方 ROLLBACK（構成だけ消える partial failure を禁止）
-- - FOR UPDATE で対象 row を lock し、使用状況確認〜DELETE の race を抑止
--
-- 禁止事項を維持:
-- - 新規 ON DELETE CASCADE 追加なし
-- - 案件 / 価格 / 請求履歴は削除しない（参照があれば IN_USE）
--
-- EXECUTE: service_role のみ（anon / authenticated には付与しない）

CREATE OR REPLACE FUNCTION public.delete_unused_package(p_package_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
  v_in_use_message constant text :=
    'このパッケージは既存データで使用されているため削除できません。利用停止してください。';
  v_deleted int;
BEGIN
  IF p_package_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'NOT_FOUND',
      'error_message', 'パッケージが見つかりません'
    );
  END IF;

  -- 内側ブロック: DELETE 途中の例外を捕捉し、local 変更を ROLLBACK したうえで
  -- DELETE_FAILED を返す（package_items だけ消える状態を残さない）。
  BEGIN
    SELECT p.id
      INTO v_id
    FROM public.packages p
    WHERE p.id = p_package_id
    FOR UPDATE;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error_code', 'NOT_FOUND',
        'error_message', 'パッケージが見つかりません'
      );
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.case_products cp
      WHERE cp.package_id = v_id
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error_code', 'IN_USE',
        'error_message', v_in_use_message
      );
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.case_packages cpkg
      WHERE cpkg.package_id = v_id
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error_code', 'IN_USE',
        'error_message', v_in_use_message
      );
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.purchase_prices pp
      WHERE pp.package_id = v_id
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error_code', 'IN_USE',
        'error_message', v_in_use_message
      );
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.sales_prices sp
      WHERE sp.package_id = v_id
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error_code', 'IN_USE',
        'error_message', v_in_use_message
      );
    END IF;

    -- invoice_line_items は FK 無しのスナップショット。テーブル未作成環境では skip。
    IF to_regclass('public.invoice_line_items') IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.invoice_line_items ili
        WHERE ili.source_package_id = v_id
      ) THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error_code', 'IN_USE',
          'error_message', v_in_use_message
        );
      END IF;
    END IF;

    -- 構成行は CASCADE 無し契約のため明示削除。履歴テーブルは触らない。
    DELETE FROM public.package_items pi
    WHERE pi.package_id = v_id;

    DELETE FROM public.packages p
    WHERE p.id = v_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    IF v_deleted <> 1 THEN
      RAISE EXCEPTION 'DELETE_FAILED: package row not deleted';
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'package_id', v_id
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- 内側ブロックの SQL 変更は undo 済み。呼び出し側へ失敗を返す。
      RETURN jsonb_build_object(
        'ok', false,
        'error_code', 'DELETE_FAILED',
        'error_message', '削除に失敗しました'
      );
  END;
END;
$$;

COMMENT ON FUNCTION public.delete_unused_package(uuid) IS
  '未使用パッケージを原子削除。FOR UPDATE→参照確認→package_items削除→packages削除。使用済みはIN_USE（削除なし）。EXECUTEはservice_roleのみ。';

REVOKE ALL ON FUNCTION public.delete_unused_package(uuid) FROM PUBLIC;
DO $$
BEGIN
  BEGIN
    REVOKE ALL ON FUNCTION public.delete_unused_package(uuid) FROM anon;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  BEGIN
    REVOKE ALL ON FUNCTION public.delete_unused_package(uuid) FROM authenticated;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  BEGIN
    REVOKE ALL ON FUNCTION public.delete_unused_package(uuid) FROM service_role;
    GRANT EXECUTE ON FUNCTION public.delete_unused_package(uuid) TO service_role;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END $$;
