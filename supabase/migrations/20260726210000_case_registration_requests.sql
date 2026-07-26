-- Ver1.0: 案件登録 RPC 用の冪等リクエスト表
-- Additive. 既存業務データに影響しない。
-- 権限方針（案C）: anon / authenticated には権限を付与しない。
-- service_role のみ RPC 実行に必要な権限を付与。

CREATE TABLE IF NOT EXISTS public.case_registration_requests (
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

-- 既存環境で列が無い場合の加算（再実行耐性）
ALTER TABLE public.case_registration_requests
  ADD COLUMN IF NOT EXISTS payload_hash text;

ALTER TABLE public.case_registration_requests
  ADD COLUMN IF NOT EXISTS error_code text;

-- 旧行が無い前提で NOT NULL を付与（未適用環境向け）。既存NULLがあれば停止。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'case_registration_requests'
      AND column_name = 'payload_hash'
      AND is_nullable = 'YES'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.case_registration_requests WHERE payload_hash IS NULL
    ) THEN
      RAISE EXCEPTION
        'case_registration_requests.payload_hash has NULL rows; refusing NOT NULL';
    END IF;
    ALTER TABLE public.case_registration_requests
      ALTER COLUMN payload_hash SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_registration_requests_status_check'
      AND conrelid = 'public.case_registration_requests'::regclass
  ) THEN
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
  '案件登録RPCの冪等キー。payload_hash で同一request_idの異payloadを拒否。';

COMMENT ON COLUMN public.case_registration_requests.payload_hash IS
  'md5(jsonb::text)。jsonb正規化によりキー順差を吸収。';

COMMENT ON COLUMN public.case_registration_requests.status IS
  'PROCESSING / COMPLETED / FAILED';

ALTER TABLE public.case_registration_requests DISABLE ROW LEVEL SECURITY;

-- 案C: PUBLIC / anon / authenticated を明示REVOKE。
-- service_role は一旦 ALL を外し、RPC実行に必要な SELECT/INSERT/UPDATE のみ再付与。
REVOKE ALL ON TABLE public.case_registration_requests FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.case_registration_requests FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.case_registration_requests FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.case_registration_requests FROM service_role;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.case_registration_requests TO service_role;
  END IF;
END $$;
