-- 施工店マスタ（Phase 1）
-- 新規テーブルのみ。既存テーブルへの変更・データ書き換え・案件への外部キーは行わない。
-- 案件側への参照列追加や過去案件の同期は行わない。

CREATE TABLE IF NOT EXISTS public.contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  postal_code text,
  address text,
  phone text,
  delivery_name text,
  delivery_address text,
  delivery_phone text,
  receiver_name text,
  memo text,
  is_active boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE public.contractors IS
  '施工店マスタ。案件登録時の初期値コピー元。案件への同期・backfillはしない。';

COMMENT ON COLUMN public.contractors.address IS
  '施工店所在地。cases.site_address（設置先）とは別概念。';

COMMENT ON COLUMN public.contractors.delivery_address IS
  '標準納品先住所。案件登録時にコピー可能な初期値。';

COMMENT ON COLUMN public.contractors.delivery_phone IS
  '標準納品先電話番号（荷受け電話の初期値）。';

COMMENT ON COLUMN public.contractors.receiver_name IS
  '標準荷受け担当者。';

CREATE INDEX IF NOT EXISTS contractors_name_idx
  ON public.contractors (name);

CREATE INDEX IF NOT EXISTS contractors_is_active_idx
  ON public.contractors (is_active);

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

DROP TRIGGER IF EXISTS contractors_set_updated_at ON public.contractors;
CREATE TRIGGER contractors_set_updated_at
  BEFORE UPDATE ON public.contractors
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

-- 既存マスタ（dealers / suppliers 等）と同様、publishable(anon) CRUD を許可
ALTER TABLE public.contractors DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contractors_anon_all ON public.contractors;
DROP POLICY IF EXISTS contractors_authenticated_all ON public.contractors;

CREATE POLICY contractors_anon_all
  ON public.contractors
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY contractors_authenticated_all
  ON public.contractors
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractors TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractors TO service_role;
