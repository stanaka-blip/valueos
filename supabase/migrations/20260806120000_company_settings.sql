-- ValueOS 発行元会社情報（シングルトン 1 行）
-- service_role のみ読み書き。anon/authenticated は直接アクセス不可。
-- 設定画面・帳票反映はこの Migration の対象外。

CREATE TABLE IF NOT EXISTS public.company_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  company_name text NOT NULL,
  postal_code text,
  address text,
  phone text,
  fax text,
  email text,
  invoice_registration_number text,
  bank_name text,
  bank_branch text,
  bank_account_type text,
  bank_account_number text,
  bank_account_holder text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.company_settings IS
  'ValueOS発行元の会社情報。常に1行（id=true）。帳票・設定画面から参照する。';

COMMENT ON COLUMN public.company_settings.id IS
  'シングルトンキー。true のみ許可し、1行固定とする。';

COMMENT ON COLUMN public.company_settings.company_name IS
  '正式社名。必須。';

COMMENT ON COLUMN public.company_settings.invoice_registration_number IS
  '適格請求書発行事業者登録番号。未設定時は NULL（仮値を入れない）。';

-- 既存の共通 updated_at 関数を再利用（なければ最小定義）
CREATE OR REPLACE FUNCTION public.valueos_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_settings_set_updated_at ON public.company_settings;
CREATE TRIGGER company_settings_set_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

-- RLS: policy 0 件。実アクセスは service_role の BYPASSRLS。
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.company_settings FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.company_settings FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.company_settings FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.company_settings FROM service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_settings TO service_role;
  END IF;
END $$;

-- 初期 1 行。社名のみ。住所・登録番号・振込先は NULL（仮値なし）。
-- 再実行時は既存行を上書きしない。
INSERT INTO public.company_settings (id, company_name)
VALUES (true, '株式会社Value Ecology')
ON CONFLICT (id) DO NOTHING;
