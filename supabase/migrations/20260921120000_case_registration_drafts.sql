-- 現場改善 ⑦: 案件登録下書き（正式 cases とは分離。KPI/一覧に混入しない）
-- Additive only. Production 適用は別途判断。

CREATE TABLE IF NOT EXISTS public.case_registration_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  payload jsonb NOT NULL,
  current_step integer NOT NULL DEFAULT 1
    CHECK (current_step >= 1 AND current_step <= 4),
  customer_name_preview text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.case_registration_drafts IS
  '案件登録ウィザードの下書き。正式 cases とは別。作成者本人のみ API 経由で操作。';

COMMENT ON COLUMN public.case_registration_drafts.created_by IS
  'staff Auth user id（session.userId）。';

COMMENT ON COLUMN public.case_registration_drafts.payload IS
  'ウィザード state（caseForm / lines / settlement / step）。version 付き JSON。';

CREATE INDEX IF NOT EXISTS case_registration_drafts_created_by_updated_at_idx
  ON public.case_registration_drafts (created_by, updated_at DESC);

CREATE OR REPLACE FUNCTION public.valueos_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS case_registration_drafts_set_updated_at
  ON public.case_registration_drafts;
CREATE TRIGGER case_registration_drafts_set_updated_at
  BEFORE UPDATE ON public.case_registration_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

ALTER TABLE public.case_registration_drafts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.case_registration_drafts FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.case_registration_drafts FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.case_registration_drafts FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.case_registration_drafts FROM service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public.case_registration_drafts TO service_role;
  END IF;
END $$;
