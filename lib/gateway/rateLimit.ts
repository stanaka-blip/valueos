import "server-only";

import { createHash } from "node:crypto";
import { getServiceRoleSupabase, ServerAdminConfigError } from "@/lib/supabase/serverAdmin";

/**
 * レート制限定数（理由は PR 本文参照）
 * - login IP: 10/60s … 単一発信元の総当たり抑制
 * - login global fail: 60/60s … 分散IP総当たりの全体上限（成功ログインは加算しない）
 * - registration: 30/60s per session+IP … 正当利用を妨げず連打を抑制
 */
export const LOGIN_IP_LIMIT = 10;
export const LOGIN_IP_WINDOW_SECONDS = 60;
export const LOGIN_GLOBAL_FAIL_LIMIT = 60;
export const LOGIN_GLOBAL_FAIL_WINDOW_SECONDS = 60;
export const REGISTRATION_LIMIT = 30;
export const REGISTRATION_WINDOW_SECONDS = 60;

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; error: "RATE_LIMITED" | "CONFIG_ERROR" };

function hashBucketPart(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function loginRateBucket(ip: string): string {
  return `login:ip:${hashBucketPart(ip || "unknown")}`;
}

export function loginGlobalFailBucket(): string {
  return "login:global:fail";
}

export function registrationRateBucket(sessionId: string, ip: string): string {
  return `reg:${hashBucketPart(`${sessionId}:${ip || "unknown"}`)}`;
}

async function maybeCleanup(): Promise<void> {
  try {
    const client = getServiceRoleSupabase();
    // 上限付き opportunistic cleanup（外部cron不要）。大規模ロック回避のため limit 付与。
    await client.rpc("gateway_rate_limit_cleanup", {
      p_max_age_seconds: 3600,
      p_limit: 100,
    });
  } catch {
    // cleanup 失敗は本処理を阻害しない
  }
}

/**
 * DB 加算テーブルによる分散対応レート制限（service_role のみ）。
 */
export async function hitRateLimit(options: {
  bucketKey: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  if (process.env.NODE_ENV !== "production") {
    const stub = process.env.GATEWAY_RATE_LIMIT_STUB;
    if (stub === "deny") {
      return { ok: false, error: "RATE_LIMITED" };
    }
    if (stub === "deny_reg" && options.bucketKey.startsWith("reg:")) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    if (stub === "allow" || stub === "deny_reg") {
      return { ok: true, remaining: options.limit };
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

    // opportunistic cleanup（約5%）。現在有効 window は SQL 側で残す。
    if (Math.random() < 0.05) {
      void maybeCleanup();
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

/** 加算せず現在値を見る（global fail の事前チェック用） */
export async function isBucketLimited(options: {
  bucketKey: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  if (process.env.NODE_ENV !== "production") {
    const stub = process.env.GATEWAY_RATE_LIMIT_STUB;
    if (stub === "deny") {
      return { ok: false, error: "RATE_LIMITED" };
    }
    if (stub === "deny_reg" && options.bucketKey.startsWith("reg:")) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    if (stub === "allow" || stub === "deny_reg") {
      return { ok: true, remaining: options.limit };
    }
  }

  try {
    const client = getServiceRoleSupabase();
    const { data, error } = await client
      .from("gateway_rate_limits")
      .select("hit_count, window_started_at")
      .eq("bucket_key", options.bucketKey)
      .maybeSingle();

    if (error) {
      gatewayRateLimitLog("select_error");
      return { ok: false, error: "CONFIG_ERROR" };
    }
    if (!data) {
      return { ok: true, remaining: options.limit };
    }

    const started = new Date(data.window_started_at).getTime();
    const ageMs = Date.now() - started;
    if (!Number.isFinite(started) || ageMs >= options.windowSeconds * 1000) {
      return { ok: true, remaining: options.limit };
    }
    if (data.hit_count >= options.limit) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    return { ok: true, remaining: Math.max(options.limit - data.hit_count, 0) };
  } catch (e) {
    if (e instanceof ServerAdminConfigError) {
      return { ok: false, error: "CONFIG_ERROR" };
    }
    gatewayRateLimitLog("select_exception");
    return { ok: false, error: "CONFIG_ERROR" };
  }
}

function gatewayRateLimitLog(reason: string) {
  console.info(JSON.stringify({ level: "info", route: "rate_limit", error_code: reason }));
}
