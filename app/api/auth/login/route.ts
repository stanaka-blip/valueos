import { NextResponse, type NextRequest } from "next/server";

import { loginWithEmailPassword } from "@/lib/auth/staffAuth";
import {
  AUTH_COOKIE_NAME,
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  SB_ACCESS_COOKIE_NAME,
  SB_REFRESH_COOKIE_NAME,
  authCookieOptions,
  createStaffSession,
  isAuthSecretConfigured,
  isLegacyStaffPasswordAllowed,
  isAppPasswordConfigured,
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
 * 社内ログイン（Supabase Auth email+password）。
 * 成功後に gateway 用 staff session cookie を発行（CSRF 維持）。
 * ALLOW_LEGACY_STAFF_PASSWORD=true のときのみ共有パスワード緊急経路を許可。
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

  if (!isAuthSecretConfigured()) {
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
        error_code:
          globalLimited.error === "RATE_LIMITED" ? "RATE_LIMITED" : "CONFIG_ERROR",
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
          body.reason === "TOO_LARGE"
            ? "リクエストが大きすぎます"
            : "不正なリクエストです",
      },
      { status: body.reason === "TOO_LARGE" ? 413 : 400 }
    );
  }

  const obj =
    body.value && typeof body.value === "object"
      ? (body.value as Record<string, unknown>)
      : {};
  const email = typeof obj.email === "string" ? obj.email.trim() : "";
  const password = typeof obj.password === "string" ? obj.password : "";
  const useLegacy =
    obj.legacySharedPassword === true && isLegacyStaffPasswordAllowed();

  if (password.length > MAX_PASSWORD_LENGTH || email.length > MAX_EMAIL_LENGTH) {
    return NextResponse.json(
      { ok: false, error_code: "BAD_REQUEST", error_message: "不正なリクエストです" },
      { status: 400 }
    );
  }

  async function failUnauthorized() {
    const failHit = await hitRateLimit({
      bucketKey: loginGlobalFailBucket(),
      limit: LOGIN_GLOBAL_FAIL_LIMIT,
      windowSeconds: LOGIN_GLOBAL_FAIL_WINDOW_SECONDS,
    });
    gatewayLog({
      route: "auth/login",
      error_code:
        failHit.ok === false && failHit.error === "RATE_LIMITED"
          ? "RATE_LIMITED"
          : "UNAUTHORIZED",
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
      {
        ok: false,
        error_code: "UNAUTHORIZED",
        error_message: "メールアドレスまたはパスワードが正しくありません",
      },
      { status: 401 }
    );
  }

  let session = null as ReturnType<typeof createStaffSession>;
  let accessToken: string | null = null;
  let refreshToken: string | null = null;

  if (useLegacy) {
    if (!isAppPasswordConfigured() || !verifyStaffPassword(password)) {
      return failUnauthorized();
    }
    session = createStaffSession({
      authMode: "legacy_password",
      userId: null,
      email: "legacy@internal",
      displayName: "社内ユーザー（暫定）",
    });
  } else {
    if (!email || !password) {
      return failUnauthorized();
    }
    const authResult = await loginWithEmailPassword({ email, password });
    if (!authResult.ok) {
      if (authResult.error.error_code === "CONFIG_ERROR") {
        return NextResponse.json(
          {
            ok: false,
            error_code: "CONFIG_ERROR",
            error_message: authResult.error.error_message,
          },
          { status: 503 }
        );
      }
      if (
        authResult.error.error_code === "INACTIVE" ||
        authResult.error.error_code === "PROFILE_MISSING"
      ) {
        gatewayLog({
          route: "auth/login",
          error_code: authResult.error.error_code,
          duration_ms: Date.now() - started,
          ok: false,
        });
        return NextResponse.json(
          {
            ok: false,
            error_code: authResult.error.error_code,
            error_message: authResult.error.error_message,
          },
          { status: 403 }
        );
      }
      return failUnauthorized();
    }
    accessToken = authResult.value.accessToken;
    refreshToken = authResult.value.refreshToken;
    session = createStaffSession({
      authMode: "supabase",
      userId: authResult.value.userId,
      email: authResult.value.email,
      displayName: authResult.value.displayName,
    });
  }

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

  const nextPath = safeNextPath(obj.next);

  const res = NextResponse.json({
    ok: true,
    csrfToken: session.csrf,
    next: nextPath,
    user: {
      email: session.email,
      displayName: session.displayName,
    },
  });
  res.cookies.set(AUTH_COOKIE_NAME, sealed, authCookieOptions());
  if (accessToken) {
    res.cookies.set(SB_ACCESS_COOKIE_NAME, accessToken, authCookieOptions());
  }
  if (refreshToken) {
    res.cookies.set(SB_REFRESH_COOKIE_NAME, refreshToken, authCookieOptions());
  }

  gatewayLog({
    route: "auth/login",
    duration_ms: Date.now() - started,
    ok: true,
  });
  return res;
}
