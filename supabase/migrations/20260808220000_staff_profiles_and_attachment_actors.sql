-- 社内スタッフプロファイル + 添付監査 user_id（additive only）
-- Auth の public signup OFF 等は Dashboard 運用（本 Migration では変更しない）
-- email は auth.users を正式値とし、ここでは重複保存しない

CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_profiles_display_name_nonempty_chk CHECK (char_length(btrim(display_name)) > 0)
);

COMMENT ON TABLE public.staff_profiles IS
  '社内スタッフ表示プロファイル。id は auth.users.id と 1:1。email は auth.users を参照。';

COMMENT ON COLUMN public.staff_profiles.display_name IS
  '画面表示名（例: 田中 太郎）。email は保存しない。';

COMMENT ON COLUMN public.staff_profiles.is_active IS
  'false の場合は ValueOS 利用不可（ログイン拒否 / セッション無効化）。';

CREATE OR REPLACE FUNCTION public.valueos_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_profiles_set_updated_at ON public.staff_profiles;
CREATE TRIGGER staff_profiles_set_updated_at
  BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.staff_profiles FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.staff_profiles FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.staff_profiles FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.staff_profiles FROM service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_profiles TO service_role;
  END IF;
END $$;

-- 添付監査: 実ユーザー紐づけ（既存行は NULL のまま。旧 uploaded_by_sid は維持）
ALTER TABLE public.case_attachments
  ADD COLUMN IF NOT EXISTS uploaded_by_user_id uuid NULL;

ALTER TABLE public.case_attachments
  ADD COLUMN IF NOT EXISTS deleted_by_user_id uuid NULL;

ALTER TABLE public.case_attachment_upload_intents
  ADD COLUMN IF NOT EXISTS uploaded_by_user_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'case_attachments_uploaded_by_user_id_fkey'
  ) THEN
    ALTER TABLE public.case_attachments
      ADD CONSTRAINT case_attachments_uploaded_by_user_id_fkey
      FOREIGN KEY (uploaded_by_user_id)
      REFERENCES public.staff_profiles (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'case_attachments_deleted_by_user_id_fkey'
  ) THEN
    ALTER TABLE public.case_attachments
      ADD CONSTRAINT case_attachments_deleted_by_user_id_fkey
      FOREIGN KEY (deleted_by_user_id)
      REFERENCES public.staff_profiles (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'case_attachment_upload_intents_uploaded_by_user_id_fkey'
  ) THEN
    ALTER TABLE public.case_attachment_upload_intents
      ADD CONSTRAINT case_attachment_upload_intents_uploaded_by_user_id_fkey
      FOREIGN KEY (uploaded_by_user_id)
      REFERENCES public.staff_profiles (id);
  END IF;
END $$;

COMMENT ON COLUMN public.case_attachments.uploaded_by_user_id IS
  'アップロードした staff_profiles.id（auth.users.id）。旧データは NULL 可。';

COMMENT ON COLUMN public.case_attachments.deleted_by_user_id IS
  'soft-delete した staff_profiles.id。旧データは NULL 可。';
