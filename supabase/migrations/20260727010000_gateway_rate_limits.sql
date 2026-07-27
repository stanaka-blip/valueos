-- Ver1.0: 案件登録ゲートウェイ用レート制限（加算のみ）
-- service_role のみ利用。anon/authenticated/PUBLIC には権限を付与しない。
-- 既存業務データ・RPC・requests 表には触れない。

CREATE TABLE IF NOT EXISTS public.gateway_rate_limits (
  bucket_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gateway_rate_limits_hit_count_check CHECK (hit_count >= 0)
);

COMMENT ON TABLE public.gateway_rate_limits IS
  '社内ゲートウェイの分散レート制限。メモリ実装の代替。';

ALTER TABLE public.gateway_rate_limits DISABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.gateway_rate_limits FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.gateway_rate_limits FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.gateway_rate_limits FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.gateway_rate_limits FROM service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gateway_rate_limits TO service_role;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.gateway_rate_limit_hit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_row public.gateway_rate_limits%ROWTYPE;
  v_count integer;
BEGIN
  IF p_bucket_key IS NULL OR btrim(p_bucket_key) = '' THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'error', 'INVALID_BUCKET');
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'error', 'INVALID_LIMIT');
  END IF;

  v_window := make_interval(secs => p_window_seconds);

  INSERT INTO public.gateway_rate_limits AS g (bucket_key, window_started_at, hit_count, updated_at)
  VALUES (p_bucket_key, v_now, 1, v_now)
  ON CONFLICT (bucket_key) DO UPDATE
    SET
      hit_count = CASE
        WHEN g.window_started_at <= v_now - v_window THEN 1
        ELSE g.hit_count + 1
      END,
      window_started_at = CASE
        WHEN g.window_started_at <= v_now - v_window THEN v_now
        ELSE g.window_started_at
      END,
      updated_at = v_now
  RETURNING * INTO v_row;

  v_count := v_row.hit_count;

  IF v_count > p_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'hit_count', v_count
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', GREATEST(p_limit - v_count, 0),
    'hit_count', v_count
  );
END;
$$;

COMMENT ON FUNCTION public.gateway_rate_limit_hit(text, integer, integer) IS
  'ゲートウェイrate limit。service_roleのみEXECUTE。';

REVOKE ALL ON FUNCTION public.gateway_rate_limit_hit(text, integer, integer) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.gateway_rate_limit_hit(text, integer, integer) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.gateway_rate_limit_hit(text, integer, integer) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION public.gateway_rate_limit_hit(text, integer, integer) FROM service_role;
    GRANT EXECUTE ON FUNCTION public.gateway_rate_limit_hit(text, integer, integer) TO service_role;
  END IF;
END $$;
