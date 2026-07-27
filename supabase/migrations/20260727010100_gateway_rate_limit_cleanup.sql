-- Ver1.0: gateway_rate_limits の古い window 掃除（加算）
-- 現在有効な window は削除しない。service_role のみ。

CREATE OR REPLACE FUNCTION public.gateway_rate_limit_cleanup(
  p_max_age_seconds integer,
  p_limit integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  IF p_max_age_seconds IS NULL OR p_max_age_seconds < 60 THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:invalid max age';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'APP:INVALID_INPUT:invalid limit';
  END IF;

  -- ctid 限定 DELETE で大規模ロックを避ける
  WITH doomed AS (
    SELECT ctid
    FROM public.gateway_rate_limits
    WHERE window_started_at < clock_timestamp() - make_interval(secs => p_max_age_seconds)
    ORDER BY window_started_at ASC
    LIMIT p_limit
  ),
  del AS (
    DELETE FROM public.gateway_rate_limits g
    USING doomed d
    WHERE g.ctid = d.ctid
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_deleted FROM del;

  RETURN coalesce(v_deleted, 0);
END;
$$;

COMMENT ON FUNCTION public.gateway_rate_limit_cleanup(integer, integer) IS
  '古い rate limit bucket を上限付き削除。service_roleのみ。定期実行またはopportunistic。';

REVOKE ALL ON FUNCTION public.gateway_rate_limit_cleanup(integer, integer) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.gateway_rate_limit_cleanup(integer, integer) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.gateway_rate_limit_cleanup(integer, integer) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION public.gateway_rate_limit_cleanup(integer, integer) FROM service_role;
    GRANT EXECUTE ON FUNCTION public.gateway_rate_limit_cleanup(integer, integer) TO service_role;
  END IF;
END $$;
