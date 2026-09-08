import { NextResponse, type NextRequest } from "next/server";

import { changeOwnPassword } from "@/lib/auth/changeOwnPassword";
import { signOutSupabaseTokens } from "@/lib/auth/staffAuth";
import {
  AUTH_COOKIE_NAME,
  SB_ACCESS_COOKIE_NAME,
  SB_REFRESH_COOKIE_NAME,
  authCookieOptions,
  MAX_PASSWORD_LENGTH,
} from "@/lib/gateway/authCookie";
import {
  assertCsrf,
  getSessionFromRequest,
  readJsonBodyLimited,
  requireJsonContentType,
} from "@/lib/gateway/http";
import { assertAppOrigin, originErrorResponse } from "@/lib/gateway/origin";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

function statusForCode(code: string): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "LEGACY_UNSUPPORTED":
    case "CURRENT_PASSWORD_INVALID":
    case "VALIDATION":
    case "UPDATE_FAILED":
    case "BAD_REQUEST":
      return 400;
    case "CONFIG_ERROR":
      return 503;
    default:
      return 400;
  }
}

/**
 * ログイン中本人のパスワード変更。
 * 成功後は staff / Supabase cookie を破棄し、再ログインを促す。
 * パスワード値はログに出さない。
 */
export async function POST(request: NextRequest) {
  const started = Date.now();

  const originResult = assertAppOrigin(request);
  if (originResult !== "ok") {
    const err = originErrorResponse(originResult);
    gatewayLog({
      route: "auth/change-password",
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
      route: "auth/change-password",
      error_code: "FORBIDDEN",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      { ok: false, error_code: "FORBIDDEN", error_message: "不正なリクエストです" },
      { status: 403 }
    );
  }

  if (!requireJsonContentType(request)) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "BAD_REQUEST",
        error_message: "Content-Type が不正です",
      },
      { status: 400 }
    );
  }

  const bodyResult = await readJsonBodyLimited(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "BAD_REQUEST",
        error_message: "リクエストが不正です",
      },
      { status: 400 }
    );
  }

  const obj =
    bodyResult.value && typeof bodyResult.value === "object"
      ? (bodyResult.value as Record<string, unknown>)
      : {};
  const currentPassword =
    typeof obj.current_password === "string" ? obj.current_password : "";
  const password = typeof obj.password === "string" ? obj.password : "";
  const confirm = typeof obj.confirm === "string" ? obj.confirm : "";

  if (
    currentPassword.length > MAX_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH ||
    confirm.length > MAX_PASSWORD_LENGTH
  ) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "VALIDATION",
        error_message: "入力が長すぎます",
      },
      { status: 400 }
    );
  }

  const result = await changeOwnPassword({
    session,
    currentPassword,
    password,
    confirm,
  });

  if (!result.ok) {
    gatewayLog({
      route: "auth/change-password",
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      {
        ok: false,
        error_code: result.error_code,
        error_message: result.error_message,
      },
      { status: statusForCode(result.error_code) }
    );
  }

  const accessToken = request.cookies.get(SB_ACCESS_COOKIE_NAME)?.value || null;
  const refreshToken =
    request.cookies.get(SB_REFRESH_COOKIE_NAME)?.value || null;
  await signOutSupabaseTokens({ accessToken, refreshToken });

  const res = NextResponse.json({
    ok: true,
    notice: "password_changed",
  });
  const clear = { ...authCookieOptions(), maxAge: 0 };
  res.cookies.set(AUTH_COOKIE_NAME, "", clear);
  res.cookies.set(SB_ACCESS_COOKIE_NAME, "", clear);
  res.cookies.set(SB_REFRESH_COOKIE_NAME, "", clear);

  gatewayLog({
    route: "auth/change-password",
    duration_ms: Date.now() - started,
    ok: true,
  });
  return res;
}
