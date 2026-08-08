import { NextResponse, type NextRequest } from "next/server";

import { signOutSupabaseTokens } from "@/lib/auth/staffAuth";
import {
  AUTH_COOKIE_NAME,
  SB_ACCESS_COOKIE_NAME,
  SB_REFRESH_COOKIE_NAME,
  authCookieOptions,
} from "@/lib/gateway/authCookie";
import { assertCsrf, getSessionFromRequest } from "@/lib/gateway/http";
import { assertAppOrigin, originErrorResponse } from "@/lib/gateway/origin";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

/**
 * 社内ログアウト。
 * - ValueOS staff session cookie
 * - Supabase Auth tokens
 * の両方を破棄。Origin + session + CSRF 必須。
 */
export async function POST(request: NextRequest) {
  const started = Date.now();

  const originResult = assertAppOrigin(request);
  if (originResult !== "ok") {
    const err = originErrorResponse(originResult);
    gatewayLog({
      route: "auth/logout",
      error_code: err.body.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(err.body, { status: err.status });
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error_code: "UNAUTHORIZED", error_message: "認証が必要です" },
      { status: 401 }
    );
  }

  if (!assertCsrf(request, session)) {
    gatewayLog({
      route: "auth/logout",
      error_code: "FORBIDDEN",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      { ok: false, error_code: "FORBIDDEN", error_message: "不正なリクエストです" },
      { status: 403 }
    );
  }

  const accessToken = request.cookies.get(SB_ACCESS_COOKIE_NAME)?.value || null;
  const refreshToken = request.cookies.get(SB_REFRESH_COOKIE_NAME)?.value || null;
  await signOutSupabaseTokens({ accessToken, refreshToken });

  const res = NextResponse.json({ ok: true });
  const clear = { ...authCookieOptions(), maxAge: 0 };
  res.cookies.set(AUTH_COOKIE_NAME, "", clear);
  res.cookies.set(SB_ACCESS_COOKIE_NAME, "", clear);
  res.cookies.set(SB_REFRESH_COOKIE_NAME, "", clear);

  gatewayLog({
    route: "auth/logout",
    duration_ms: Date.now() - started,
    ok: true,
  });
  return res;
}
