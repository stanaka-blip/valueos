import "server-only";

import { createHash } from "node:crypto";
import { getServiceRoleSupabase, ServerAdminConfigError } from "@/lib/supabase/serverAdmin";

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; error: "RATE_LIMITED" | "CONFIG_ERROR" };

function hashBucketPart(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function loginRateBucket(ip: string): string {
  return `login:${hashBucketPart(ip || "unknown")}`;
}

export function registrationRateBucket(sessionId: string, ip: string): string {
  return `reg:${hashBucketPart(`${sessionId}:${ip || "unknown"}`)}`;
}

/**
 * DB 加算テーブルによる分散対応レート制限（service_role のみ）。
 * メモリ実装は正本にしない。
 */
export async function hitRateLimit(options: {
  bucketKey: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  // 非本番テスト専用。本番では絶対に有効化しない。
  if (process.env.NODE_ENV !== "production") {
    if (process.env.GATEWAY_RATE_LIMIT_STUB === "allow") {
      return { ok: true, remaining: options.limit };
    }
    if (process.env.GATEWAY_RATE_LIMIT_STUB === "deny") {
      return { ok: false, error: "RATE_LIMITED" };
    }
  }

  try {
    const client = getServiceRoleSupabase();
    const { data, error } = await client.rpc("gateway_rate_limit_hit", {
      p_bucket_key: options.bucketKey,
      p_limit: options.limit,
      p_window_seconds: options.windowSeconds,
    });

    if (error) {
      gatewayRateLimitLog("rpc_error");
      return { ok: false, error: "CONFIG_ERROR" };
    }

    const row = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    if (row.allowed === true) {
      return {
        ok: true,
        remaining: typeof row.remaining === "number" ? row.remaining : 0,
      };
    }
    return { ok: false, error: "RATE_LIMITED" };
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return { ok: false, error: "CONFIG_ERROR" };
    }
    gatewayRateLimitLog("exception");
    return { ok: false, error: "CONFIG_ERROR" };
  }
}

function gatewayRateLimitLog(reason: string) {
  console.info(JSON.stringify({ level: "info", route: "rate_limit", error_code: reason }));
}
