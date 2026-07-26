-- Ver1.0: 案件登録 RPC 用の冪等リクエスト表
-- Additive. 既存データに影響しない。

CREATE TABLE IF NOT EXISTS public.case_registration_requests (
  request_id uuid PRIMARY KEY,
  case_id uuid NULL REFERENCES public.cases (id) ON DELETE SET NULL,
  status text NOT NULL,
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
    WHERE conname = 'case_registration_requests_status_check'
      AND conrelid = 'public.case_registration_requests'::regclass
  ) THEN
    -- 既存定義が期待と異なる場合は削除せず停止
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'case_registration_requests_status_check'
        AND conrelid = 'public.case_registration_requests'::regclass
        AND pg_get_constraintdef(oid) ILIKE '%PROCESSING%'
        AND pg_get_constraintdef(oid) ILIKE '%COMPLETED%'
        AND pg_get_constraintdef(oid) ILIKE '%FAILED%'
    ) THEN
      RAISE EXCEPTION
        'case_registration_requests_status_check exists with unexpected definition';
    END IF;
  ELSE
    ALTER TABLE public.case_registration_requests
      ADD CONSTRAINT case_registration_requests_status_check
      CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS case_registration_requests_case_id_idx
  ON public.case_registration_requests (case_id);

CREATE INDEX IF NOT EXISTS case_registration_requests_status_created_at_idx
  ON public.case_registration_requests (status, created_at);

COMMENT ON TABLE public.case_registration_requests IS
  '案件登録RPCの冪等キー。同一request_idの二重案件作成を防ぐ。';

COMMENT ON COLUMN public.case_registration_requests.status IS
  'PROCESSING / COMPLETED / FAILED';

-- 既存運用に合わせ anon/authenticated へ CRUD（RLSは無効）
ALTER TABLE public.case_registration_requests DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_registration_requests TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_registration_requests TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_registration_requests TO service_role;
  END IF;
END $$;
