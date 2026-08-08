import { NextResponse, type NextRequest } from "next/server";

import { assertStaffSessionStillAllowed } from "@/lib/auth/staffAuth";
import {
  AUTH_COOKIE_NAME,
  SB_ACCESS_COOKIE_NAME,
  SB_REFRESH_COOKIE_NAME,
  authCookieOptions,
} from "@/lib/gateway/authCookie";
import { getSessionFromRequest } from "@/lib/gateway/http";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

/**
 * ログイン中ユーザー情報。
 * inactive / profile 欠落なら cookie を破棄して 401/403。
 */
export async function GET(request: NextRequest) {
  const started = Date.now();
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error_code: "UNAUTHORIZED", error_message: "認証が必要です" },
      { status: 401 }
    );
  }

  const allowed = await assertStaffSessionStillAllowed(session);
  if (!allowed.ok) {
    const res = NextResponse.json(
      {
        ok: false,
        error_code: allowed.error_code,
        error_message:
          allowed.error_code === "INACTIVE"
            ? "このアカウントは利用停止中です"
            : allowed.error_code === "PROFILE_MISSING"
              ? "社内ユーザー登録が完了していません"
              : "サーバー設定が完了していません",
      },
      {
        status:
          allowed.error_code === "CONFIG_ERROR"
            ? 503
            : allowed.error_code === "INACTIVE"
              ? 403
              : 401,
      }
    );
    const clear = { ...authCookieOptions(), maxAge: 0 };
    res.cookies.set(AUTH_COOKIE_NAME, "", clear);
    res.cookies.set(SB_ACCESS_COOKIE_NAME, "", clear);
    res.cookies.set(SB_REFRESH_COOKIE_NAME, "", clear);
    gatewayLog({
      route: "auth/me",
      error_code: allowed.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return res;
  }

  gatewayLog({
    route: "auth/me",
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json({
    ok: true,
    user: {
      userId: session.userId,
      email: allowed.email,
      displayName: allowed.displayName,
      isAdmin: allowed.isAdmin,
      authMode: session.authMode,
    },
  });
}
