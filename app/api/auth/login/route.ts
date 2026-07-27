import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE_NAME,
  MAX_PASSWORD_LENGTH,
  authCookieOptions,
  createStaffSession,
  isAppPasswordConfigured,
  isAuthSecretConfigured,
  sealStaffSession,
  verifyStaffPassword,
} from "@/lib/gateway/authCookie";
import {
  clientIp,
  readJsonBodyLimited,
  requireJsonContentType,
  safeNextPath,
} from "@/lib/gateway/http";
import { assertAppOrigin, originErrorResponse } from "@/lib/gateway/origin";
import {
  LOGIN_GLOBAL_FAIL_LIMIT,
  LOGIN_GLOBAL_FAIL_WINDOW_SECONDS,
  LOGIN_IP_LIMIT,
  LOGIN_IP_WINDOW_SECONDS,
  hitRateLimit,
  isBucketLimited,
  loginGlobalFailBucket,
  loginRateBucket,
} from "@/lib/gateway/rateLimit";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

/**
 * 暫定社内ログイン。Supabase Auth の代替として恒久化しない。
 */
export async function POST(request: NextRequest) {
  const started = Date.now();

  const originResult = assertAppOrigin(request);
  if (originResult !== "ok") {
    const err = originErrorResponse(originResult);
    gatewayLog({
      route: "auth/login",
      error_code: err.body.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(err.body, { status: err.status });
  }

  if (!requireJsonContentType(request)) {
    return NextResponse.json(
      { ok: false, error_code: "BAD_REQUEST", error_message: "不正なリクエストです" },
      { status: 415 }
    );
  }

  if (!isAppPasswordConfigured() || !isAuthSecretConfigured()) {
    gatewayLog({
      route: "auth/login",
      error_code: "CONFIG_ERROR",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      {
        ok: false,
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
      },
      { status: 503 }
    );
  }

  const ip = clientIp(request);

  const globalLimited = await isBucketLimited({
    bucketKey: loginGlobalFailBucket(),
    limit: LOGIN_GLOBAL_FAIL_LIMIT,
    windowSeconds: LOGIN_GLOBAL_FAIL_WINDOW_SECONDS,
  });
  if (!globalLimited.ok) {
    const status = globalLimited.error === "RATE_LIMITED" ? 429 : 503;
    gatewayLog({
      route: "auth/login",
      error_code: globalLimited.error,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      {
        ok: false,
        error_code: globalLimited.error === "RATE_LIMITED" ? "RATE_LIMITED" : "CONFIG_ERROR",
        error_message:
          globalLimited.error === "RATE_LIMITED"
            ? "しばらく時間をおいて再度お試しください"
            : "サーバー設定が完了していません",
      },
      { status }
    );
  }

  const ipLimited = await hitRateLimit({
    bucketKey: loginRateBucket(ip),
    limit: LOGIN_IP_LIMIT,
    windowSeconds: LOGIN_IP_WINDOW_SECONDS,
  });
  if (!ipLimited.ok) {
    const status = ipLimited.error === "RATE_LIMITED" ? 429 : 503;
    gatewayLog({
      route: "auth/login",
      error_code: ipLimited.error,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      {
        ok: false,
        error_code: ipLimited.error === "RATE_LIMITED" ? "RATE_LIMITED" : "CONFIG_ERROR",
        error_message:
          ipLimited.error === "RATE_LIMITED"
            ? "しばらく時間をおいて再度お試しください"
            : "サーバー設定が完了していません",
      },
      { status }
    );
  }

  const body = await readJsonBodyLimited(request);
  if (!body.ok) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "BAD_REQUEST",
        error_message:
          body.reason === "TOO_LARGE" ? "リクエストが大きすぎます" : "不正なリクエストです",
      },
      { status: body.reason === "TOO_LARGE" ? 413 : 400 }
    );
  }

  const password =
    body.value &&
    typeof body.value === "object" &&
    typeof (body.value as { password?: unknown }).password === "string"
      ? (body.value as { password: string }).password
      : "";

  if (password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json(
      { ok: false, error_code: "BAD_REQUEST", error_message: "不正なリクエストです" },
      { status: 400 }
    );
  }

  if (!verifyStaffPassword(password)) {
    const failHit = await hitRateLimit({
      bucketKey: loginGlobalFailBucket(),
      limit: LOGIN_GLOBAL_FAIL_LIMIT,
      windowSeconds: LOGIN_GLOBAL_FAIL_WINDOW_SECONDS,
    });
    gatewayLog({
      route: "auth/login",
      error_code: failHit.ok === false && failHit.error === "RATE_LIMITED" ? "RATE_LIMITED" : "UNAUTHORIZED",
      duration_ms: Date.now() - started,
      ok: false,
    });
    if (!failHit.ok && failHit.error === "RATE_LIMITED") {
      return NextResponse.json(
        {
          ok: false,
          error_code: "RATE_LIMITED",
          error_message: "しばらく時間をおいて再度お試しください",
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { ok: false, error_code: "UNAUTHORIZED", error_message: "認証に失敗しました" },
      { status: 401 }
    );
  }

  const session = createStaffSession();
  const sealed = session ? sealStaffSession(session) : null;
  if (!session || !sealed) {
    gatewayLog({
      route: "auth/login",
      error_code: "CONFIG_ERROR",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      {
        ok: false,
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
      },
      { status: 503 }
    );
  }

  const nextPath = safeNextPath(
    body.value && typeof body.value === "object"
      ? (body.value as { next?: unknown }).next
      : undefined
  );

  const res = NextResponse.json({
    ok: true,
    csrfToken: session.csrf,
    next: nextPath,
  });
  res.cookies.set(AUTH_COOKIE_NAME, sealed, authCookieOptions());

  gatewayLog({
    route: "auth/login",
    duration_ms: Date.now() - started,
    ok: true,
  });
  return res;
}
