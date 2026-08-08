-- staff_profiles.is_admin（additive only）
-- 初回管理者は Dashboard で Auth ユーザー作成 + staff_profiles INSERT 時に is_admin=true を設定する。

ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff_profiles.is_admin IS
  'true の場合のみ /staff ユーザー管理（招待・無効化・再招待）を実行できる。本格RBACではない。';

-- 既存行は DEFAULT false のまま（人間が最初の管理者を SQL で昇格）
