-- ValueOS Role / Permission / Scope Core (stacked on Organization Core)
-- Additive only. Does NOT alter staff_profiles / Auth / dealers / cases / organizations*.
-- Does NOT wire RBAC into RLS policies or runtime Auth (next phase).
-- Production apply: human-reviewed only; do not auto-apply.

-- ---------------------------------------------------------------------------
-- Design note (Scope assignment):
-- organization_membership_roles.scope_id を採用。
-- 判定単位 = Membership × Role × Scope。Permission は role_permissions 経由で統合。
-- 1 Membership 複数 Role は行を増やすだけで破綻しない。
-- 将来 Resource 単位 Permission（CASE_EDIT 等）を増やす場合も、本テーブルは維持可能。
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  display_name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_code_unique UNIQUE (code),
  CONSTRAINT roles_code_format_chk CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT roles_display_name_nonempty_chk
    CHECK (char_length(btrim(display_name)) > 0)
);

COMMENT ON TABLE public.roles IS
  'ValueOS Role Master。User 単位ではなく organization_memberships に割当。';

COMMENT ON COLUMN public.roles.code IS
  '内部固定コード（ADMIN / MANAGER / SALES / BACK_OFFICE / GENERAL）。';

CREATE INDEX IF NOT EXISTS roles_is_active_idx ON public.roles (is_active);
CREATE INDEX IF NOT EXISTS roles_sort_order_idx ON public.roles (sort_order);

CREATE OR REPLACE FUNCTION public.valueos_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roles_set_updated_at ON public.roles;
CREATE TRIGGER roles_set_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. permissions（業務 Action。画面名ではない）
-- DELETE は標準に含めない（inactive / cancel / disable 方針）。
-- 将来 Resource 単位（CASE_EDIT 等）へ拡張する場合は code 名前空間で追加し、
-- 本テーブル構造は維持する想定。巨大一覧の先取り seed はしない。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  display_name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permissions_code_unique UNIQUE (code),
  CONSTRAINT permissions_code_format_chk CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT permissions_display_name_nonempty_chk
    CHECK (char_length(btrim(display_name)) > 0)
);

COMMENT ON TABLE public.permissions IS
  '業務 Action Permission（VIEW/CREATE/EDIT/APPROVE/EXPORT）。DELETE 非標準。将来 Resource 単位拡張可。';

COMMENT ON COLUMN public.permissions.code IS
  '内部固定 Action コード。画面名ではない。';

CREATE INDEX IF NOT EXISTS permissions_is_active_idx
  ON public.permissions (is_active);

DROP TRIGGER IF EXISTS permissions_set_updated_at ON public.permissions;
CREATE TRIGGER permissions_set_updated_at
  BEFORE UPDATE ON public.permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. role_permissions（Role × Permission N:N）
-- 業務割当の大量 seed はしない（モデルのみ）。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles (id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_permissions_role_permission_unique
    UNIQUE (role_id, permission_id)
);

COMMENT ON TABLE public.role_permissions IS
  'Role と Permission の N:N。初期業務マトリクスは未 seed（Core モデルのみ）。';

CREATE INDEX IF NOT EXISTS role_permissions_role_idx
  ON public.role_permissions (role_id);

CREATE INDEX IF NOT EXISTS role_permissions_permission_idx
  ON public.role_permissions (permission_id);

-- ---------------------------------------------------------------------------
-- 4. scopes
-- TEAM は code として用意。teams / team_members テーブルは今回作らない。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  display_name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scopes_code_unique UNIQUE (code),
  CONSTRAINT scopes_code_format_chk CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT scopes_display_name_nonempty_chk
    CHECK (char_length(btrim(display_name)) > 0)
);

COMMENT ON TABLE public.scopes IS
  'データ可視範囲。SELF < TEAM < ORGANIZATION < ALL。Team 実体モデルは将来。';

COMMENT ON COLUMN public.scopes.code IS
  'SELF / TEAM / ORGANIZATION / ALL。';

CREATE INDEX IF NOT EXISTS scopes_is_active_idx ON public.scopes (is_active);
CREATE INDEX IF NOT EXISTS scopes_sort_order_idx ON public.scopes (sort_order);

DROP TRIGGER IF EXISTS scopes_set_updated_at ON public.scopes;
CREATE TRIGGER scopes_set_updated_at
  BEFORE UPDATE ON public.scopes
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. organization_membership_roles
-- Role は User 単位ではなく Membership 単位。
-- scope_id を持ち、Membership × Role × Scope を1行で表現。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_membership_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_membership_id uuid NOT NULL
    REFERENCES public.organization_memberships (id) ON DELETE CASCADE,
  role_id uuid NOT NULL
    REFERENCES public.roles (id) ON DELETE RESTRICT,
  scope_id uuid NOT NULL
    REFERENCES public.scopes (id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_membership_roles_membership_role_unique
    UNIQUE (organization_membership_id, role_id)
);

COMMENT ON TABLE public.organization_membership_roles IS
  'Organization Membership への Role 割当。scope_id 付き。1 Membership 複数 Role 可。';

COMMENT ON COLUMN public.organization_membership_roles.scope_id IS
  '当該 Role 割当のデータ可視 Scope。Permission は role_permissions で解決。';

CREATE INDEX IF NOT EXISTS organization_membership_roles_membership_idx
  ON public.organization_membership_roles (organization_membership_id);

CREATE INDEX IF NOT EXISTS organization_membership_roles_role_idx
  ON public.organization_membership_roles (role_id);

CREATE INDEX IF NOT EXISTS organization_membership_roles_scope_idx
  ON public.organization_membership_roles (scope_id);

CREATE INDEX IF NOT EXISTS organization_membership_roles_active_idx
  ON public.organization_membership_roles (organization_membership_id, is_active);

DROP TRIGGER IF EXISTS organization_membership_roles_set_updated_at
  ON public.organization_membership_roles;
CREATE TRIGGER organization_membership_roles_set_updated_at
  BEFORE UPDATE ON public.organization_membership_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed（idempotent）
-- ---------------------------------------------------------------------------
INSERT INTO public.roles (id, code, display_name, description, sort_order, is_active)
VALUES
  ('b1000000-0000-4000-8000-000000000001', 'ADMIN', '管理者', '組織管理者', 10, true),
  ('b1000000-0000-4000-8000-000000000002', 'MANAGER', 'マネージャー', 'マネージャー', 20, true),
  ('b1000000-0000-4000-8000-000000000003', 'SALES', '営業', '営業', 30, true),
  ('b1000000-0000-4000-8000-000000000004', 'BACK_OFFICE', 'BO', 'バックオフィス', 40, true),
  ('b1000000-0000-4000-8000-000000000005', 'GENERAL', '一般', '一般ユーザー', 50, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.permissions (id, code, display_name, description, is_active)
VALUES
  ('b2000000-0000-4000-8000-000000000001', 'VIEW', '閲覧', '参照 Action', true),
  ('b2000000-0000-4000-8000-000000000002', 'CREATE', '作成', '作成 Action', true),
  ('b2000000-0000-4000-8000-000000000003', 'EDIT', '編集', '編集 Action', true),
  ('b2000000-0000-4000-8000-000000000004', 'APPROVE', '承認', '承認 Action', true),
  ('b2000000-0000-4000-8000-000000000005', 'EXPORT', 'エクスポート', 'エクスポート Action', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.scopes (id, code, display_name, description, sort_order, is_active)
VALUES
  ('b3000000-0000-4000-8000-000000000001', 'SELF', '自分', '自分に直接関係するデータのみ', 10, true),
  ('b3000000-0000-4000-8000-000000000002', 'TEAM', 'チーム', '所属チーム単位（Teamモデルは将来）', 20, true),
  ('b3000000-0000-4000-8000-000000000003', 'ORGANIZATION', '組織', '現在の Organization 全体', 30, true),
  ('b3000000-0000-4000-8000-000000000004', 'ALL', '全体', '複数 Organization 横断', 40, true)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS（PR #127 と同方針: policy 0 + service_role only。RBAC を RLS に直結しない）
-- ---------------------------------------------------------------------------
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_membership_roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.roles FROM PUBLIC;
REVOKE ALL ON TABLE public.permissions FROM PUBLIC;
REVOKE ALL ON TABLE public.role_permissions FROM PUBLIC;
REVOKE ALL ON TABLE public.scopes FROM PUBLIC;
REVOKE ALL ON TABLE public.organization_membership_roles FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.roles FROM anon;
    REVOKE ALL ON TABLE public.permissions FROM anon;
    REVOKE ALL ON TABLE public.role_permissions FROM anon;
    REVOKE ALL ON TABLE public.scopes FROM anon;
    REVOKE ALL ON TABLE public.organization_membership_roles FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.roles FROM authenticated;
    REVOKE ALL ON TABLE public.permissions FROM authenticated;
    REVOKE ALL ON TABLE public.role_permissions FROM authenticated;
    REVOKE ALL ON TABLE public.scopes FROM authenticated;
    REVOKE ALL ON TABLE public.organization_membership_roles FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.roles FROM service_role;
    REVOKE ALL ON TABLE public.permissions FROM service_role;
    REVOKE ALL ON TABLE public.role_permissions FROM service_role;
    REVOKE ALL ON TABLE public.scopes FROM service_role;
    REVOKE ALL ON TABLE public.organization_membership_roles FROM service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.roles TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.permissions TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.role_permissions TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scopes TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_membership_roles TO service_role;
  END IF;
END $$;
