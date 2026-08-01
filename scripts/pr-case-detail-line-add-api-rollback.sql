-- Rollback SQL for append_case_line (PR-B)
-- 本番では適用しないこと。隔離環境 / 手動ロールバック用。
-- 既存業務データ・create_case_registration は変更しない。

DROP FUNCTION IF EXISTS public.append_case_line(jsonb);
DROP TABLE IF EXISTS public.case_line_append_requests;
