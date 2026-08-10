-- PR2: 3社間金銭イベント API 用冪等 ledger
-- Additive only。業務テーブルの意味は変更しない。
-- 書込は service_role のみ（gateway 前提）。

CREATE TABLE IF NOT EXISTS public.three_party_money_requests (
  request_id uuid PRIMARY KEY,
  action text NOT NULL,
  case_id uuid NULL REFERENCES public.cases (id) ON DELETE SET NULL,
  resource_id uuid NULL,
  status text NOT NULL,
  payload_hash text NOT NULL,
  error_code text NULL,
  error_message text NULL,
  response jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CONSTRAINT three_party_money_requests_status_chk CHECK (
    status IN ('PROCESSING', 'COMPLETED', 'FAILED')
  ),
  CONSTRAINT three_party_money_requests_action_nonempty_chk CHECK (
    char_length(btrim(action)) > 0
  )
);

CREATE INDEX IF NOT EXISTS three_party_money_requests_case_id_idx
  ON public.three_party_money_requests (case_id);

CREATE INDEX IF NOT EXISTS three_party_money_requests_status_created_at_idx
  ON public.three_party_money_requests (status, created_at);

CREATE INDEX IF NOT EXISTS three_party_money_requests_action_idx
  ON public.three_party_money_requests (action);

COMMENT ON TABLE public.three_party_money_requests IS
  '3社間金銭APIの冪等リクエスト ledger。payload_hash で同一 request_id の異payloadを拒否。';

COMMENT ON COLUMN public.three_party_money_requests.payload_hash IS
  '正規化 JSON の sha256（hex）。gateway が算出して保存。';

COMMENT ON COLUMN public.three_party_money_requests.resource_id IS
  '作成/対象となった金銭レコードID（完了時）。';

ALTER TABLE public.three_party_money_requests DISABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.three_party_money_requests FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.three_party_money_requests FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.three_party_money_requests FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.three_party_money_requests FROM service_role;
    GRANT SELECT, INSERT, UPDATE
      ON TABLE public.three_party_money_requests TO service_role;
  END IF;
END $$;
