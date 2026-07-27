import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, authCookieOptions } from "@/lib/gateway/authCookie";
import { assertCsrf, getSessionFromRequest } from "@/lib/gateway/http";
import { assertAppOrigin, originErrorResponse } from "@/lib/gateway/origin";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

/**
 * 暫定社内ログアウト。session + CSRF + Origin 必須。
 * 失敗時は cookie を変更しない。
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

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, "", {
    ...authCookieOptions(),
    maxAge: 0,
  });
  gatewayLog({
    route: "auth/logout",
    duration_ms: Date.now() - started,
    ok: true,
  });
  return res;
}
