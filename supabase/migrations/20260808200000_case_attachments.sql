-- 案件添付資料（metadata + upload intents）
-- Storage bucket `case-attachments` の作成は本番適用と分離（README / docs 手順）。
-- アクセスは service_role のみ。anon / authenticated は直接アクセス不可。

CREATE TABLE IF NOT EXISTS public.case_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases (id),
  attachment_type text NOT NULL,
  original_filename text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'case-attachments',
  storage_path text NOT NULL,
  uploaded_by_sid text NULL,
  uploaded_by_label text NOT NULL DEFAULT '社内ユーザー',
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NULL,
  deleted_by_sid text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_attachments_type_chk CHECK (
    attachment_type IN (
      'estimate',
      'contract',
      'drawing',
      'photo',
      'invoice_doc',
      'other'
    )
  ),
  CONSTRAINT case_attachments_byte_size_chk CHECK (
    byte_size > 0 AND byte_size <= 20971520
  ),
  CONSTRAINT case_attachments_storage_path_uniq UNIQUE (storage_path),
  CONSTRAINT case_attachments_inactive_deleted_chk CHECK (
    (is_active = true AND deleted_at IS NULL)
    OR (is_active = false AND deleted_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS case_attachments_case_id_active_idx
  ON public.case_attachments (case_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS case_attachments_case_id_created_idx
  ON public.case_attachments (case_id, created_at DESC);

COMMENT ON TABLE public.case_attachments IS
  '案件添付資料の metadata。ファイル本体は Storage bucket case-attachments（private）。';

COMMENT ON COLUMN public.case_attachments.storage_path IS
  'server 生成のみ。形式: cases/{case_id}/{attachment_id}/{sanitized_filename}';

CREATE TABLE IF NOT EXISTS public.case_attachment_upload_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id uuid NOT NULL,
  case_id uuid NOT NULL REFERENCES public.cases (id),
  attachment_type text NOT NULL,
  original_filename text NOT NULL,
  content_type text NOT NULL,
  declared_byte_size bigint NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'case-attachments',
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  uploaded_by_sid text NULL,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_attachment_upload_intents_attachment_id_uniq UNIQUE (attachment_id),
  CONSTRAINT case_attachment_upload_intents_storage_path_uniq UNIQUE (storage_path),
  CONSTRAINT case_attachment_upload_intents_type_chk CHECK (
    attachment_type IN (
      'estimate',
      'contract',
      'drawing',
      'photo',
      'invoice_doc',
      'other'
    )
  ),
  CONSTRAINT case_attachment_upload_intents_byte_size_chk CHECK (
    declared_byte_size > 0 AND declared_byte_size <= 20971520
  ),
  CONSTRAINT case_attachment_upload_intents_status_chk CHECK (
    status IN ('pending', 'completed', 'expired', 'abandoned')
  )
);

CREATE INDEX IF NOT EXISTS case_attachment_upload_intents_case_pending_idx
  ON public.case_attachment_upload_intents (case_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS case_attachment_upload_intents_expires_idx
  ON public.case_attachment_upload_intents (expires_at)
  WHERE status = 'pending';

COMMENT ON TABLE public.case_attachment_upload_intents IS
  'signed upload 発行〜complete までの意図。complete 失敗時の orphan 検出に使う。';

CREATE OR REPLACE FUNCTION public.valueos_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS case_attachments_set_updated_at ON public.case_attachments;
CREATE TRIGGER case_attachments_set_updated_at
  BEFORE UPDATE ON public.case_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

DROP TRIGGER IF EXISTS case_attachment_upload_intents_set_updated_at
  ON public.case_attachment_upload_intents;
CREATE TRIGGER case_attachment_upload_intents_set_updated_at
  BEFORE UPDATE ON public.case_attachment_upload_intents
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

ALTER TABLE public.case_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_attachment_upload_intents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.case_attachments FROM PUBLIC;
REVOKE ALL ON TABLE public.case_attachment_upload_intents FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.case_attachments FROM anon;
    REVOKE ALL ON TABLE public.case_attachment_upload_intents FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.case_attachments FROM authenticated;
    REVOKE ALL ON TABLE public.case_attachment_upload_intents FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.case_attachments FROM service_role;
    REVOKE ALL ON TABLE public.case_attachment_upload_intents FROM service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.case_attachments TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.case_attachment_upload_intents TO service_role;
  END IF;
END $$;
