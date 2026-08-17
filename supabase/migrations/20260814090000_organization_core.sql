-- ValueOS Organization Core (Phase 0-1)
-- Additive only. Does NOT alter dealers / contractors / suppliers / manufacturers /
-- cases / staff_profiles or any existing operational tables.
-- Production apply: human-reviewed only (do not auto-apply from this PR).

-- ---------------------------------------------------------------------------
-- 1. organizations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_name_nonempty_chk CHECK (char_length(btrim(name)) > 0)
);

COMMENT ON TABLE public.organizations IS
  'ValueOS 統合組織。1組織が複数タイプを持てる。既存 dealers/contractors 等とは未結合（将来対応）。';

COMMENT ON COLUMN public.organizations.name IS
  '表示用組織名。必須。';

COMMENT ON COLUMN public.organizations.legal_name IS
  '登記上の正式名称。未設定可。';

COMMENT ON COLUMN public.organizations.is_active IS
  'false の場合は所属・利用の対象外として扱う（論理無効）。';

CREATE INDEX IF NOT EXISTS organizations_is_active_idx
  ON public.organizations (is_active);

CREATE INDEX IF NOT EXISTS organizations_name_idx
  ON public.organizations (name);

CREATE OR REPLACE FUNCTION public.valueos_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_set_updated_at ON public.organizations;
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. organization_types（コード固定・表示名分離）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  display_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_types_code_unique UNIQUE (code),
  CONSTRAINT organization_types_code_format_chk CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT organization_types_display_name_nonempty_chk
    CHECK (char_length(btrim(display_name)) > 0)
);

COMMENT ON TABLE public.organization_types IS
  '組織タイプ Master。code は内部固定値、display_name は表示用。';

COMMENT ON COLUMN public.organization_types.code IS
  '内部コード（HEADQUARTERS / AGENCY / CONTRACTOR / TRADING）。アプリは code を正とする。';

COMMENT ON COLUMN public.organization_types.display_name IS
  '画面表示名（本社 / 代理店 / 施工店 / 商社）。';

CREATE INDEX IF NOT EXISTS organization_types_is_active_idx
  ON public.organization_types (is_active);

CREATE INDEX IF NOT EXISTS organization_types_sort_order_idx
  ON public.organization_types (sort_order);

DROP TRIGGER IF EXISTS organization_types_set_updated_at ON public.organization_types;
CREATE TRIGGER organization_types_set_updated_at
  BEFORE UPDATE ON public.organization_types
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. organization_type_assignments（Organization × Type N:N）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_type_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  organization_type_id uuid NOT NULL
    REFERENCES public.organization_types (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_type_assignments_org_type_unique
    UNIQUE (organization_id, organization_type_id)
);

COMMENT ON TABLE public.organization_type_assignments IS
  'Organization と Organization Type の N:N。同一組み合わせの重複を禁止。';

CREATE INDEX IF NOT EXISTS organization_type_assignments_org_idx
  ON public.organization_type_assignments (organization_id);

CREATE INDEX IF NOT EXISTS organization_type_assignments_type_idx
  ON public.organization_type_assignments (organization_type_id);

DROP TRIGGER IF EXISTS organization_type_assignments_set_updated_at
  ON public.organization_type_assignments;
CREATE TRIGGER organization_type_assignments_set_updated_at
  BEFORE UPDATE ON public.organization_type_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. organization_memberships（auth.users × Organization N:N）
-- staff_profiles は維持。membership は auth.users を直接参照し、将来の非 staff も許容。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_memberships_user_org_unique
    UNIQUE (user_id, organization_id)
);

COMMENT ON TABLE public.organization_memberships IS
  'Auth User と Organization の N:N。1ユーザー複数組織可。Role/Permission は次PR。';

COMMENT ON COLUMN public.organization_memberships.user_id IS
  'Supabase auth.users.id。staff_profiles.id と同一空間だが staff_profiles 置換はしない。';

COMMENT ON COLUMN public.organization_memberships.is_active IS
  'false で所属を論理無効化（行は残す）。';

CREATE INDEX IF NOT EXISTS organization_memberships_user_idx
  ON public.organization_memberships (user_id);

CREATE INDEX IF NOT EXISTS organization_memberships_org_idx
  ON public.organization_memberships (organization_id);

CREATE INDEX IF NOT EXISTS organization_memberships_user_active_idx
  ON public.organization_memberships (user_id, is_active);

DROP TRIGGER IF EXISTS organization_memberships_set_updated_at
  ON public.organization_memberships;
CREATE TRIGGER organization_memberships_set_updated_at
  BEFORE UPDATE ON public.organization_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed: organization_types（idempotent）
-- 固定 UUID で再実行・環境間の参照を安定化。既存行は上書きしない。
-- ---------------------------------------------------------------------------
INSERT INTO public.organization_types (id, code, display_name, sort_order, is_active)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'HEADQUARTERS', '本社', 10, true),
  ('a1000000-0000-4000-8000-000000000002', 'AGENCY', '代理店', 20, true),
  ('a1000000-0000-4000-8000-000000000003', 'CONTRACTOR', '施工店', 30, true),
  ('a1000000-0000-4000-8000-000000000004', 'TRADING', '商社', 40, true)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS / grants（安全側: policy 0 件 + service_role のみ）
-- 既存 dealers 等の「anon 全許可」パターンはコピーしない。
-- Role/Permission 本実装は次PR。今回は gateway/service_role 経由のみ想定。
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_type_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organizations FROM PUBLIC;
REVOKE ALL ON TABLE public.organization_types FROM PUBLIC;
REVOKE ALL ON TABLE public.organization_type_assignments FROM PUBLIC;
REVOKE ALL ON TABLE public.organization_memberships FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.organizations FROM anon;
    REVOKE ALL ON TABLE public.organization_types FROM anon;
    REVOKE ALL ON TABLE public.organization_type_assignments FROM anon;
    REVOKE ALL ON TABLE public.organization_memberships FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.organizations FROM authenticated;
    REVOKE ALL ON TABLE public.organization_types FROM authenticated;
    REVOKE ALL ON TABLE public.organization_type_assignments FROM authenticated;
    REVOKE ALL ON TABLE public.organization_memberships FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.organizations FROM service_role;
    REVOKE ALL ON TABLE public.organization_types FROM service_role;
    REVOKE ALL ON TABLE public.organization_type_assignments FROM service_role;
    REVOKE ALL ON TABLE public.organization_memberships FROM service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organizations TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_types TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_type_assignments TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_memberships TO service_role;
  END IF;
END $$;
