import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  createStaffSession,
  sealStaffSession,
  verifyStaffPassword,
} from "@/lib/gateway/authCookie";
import {
  clientIp,
  readJsonBodyLimited,
  requireJsonContentType,
  safeNextPath,
} from "@/lib/gateway/http";
import { hitRateLimit, loginRateBucket } from "@/lib/gateway/rateLimit";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

/**
 * 暫定社内ログイン。Supabase Auth の代替として恒久化しない。
 */
export async function POST(request: NextRequest) {
  const started = Date.now();

  if (!requireJsonContentType(request)) {
    return NextResponse.json(
      { ok: false, error_code: "BAD_REQUEST", error_message: "不正なリクエストです" },
      { status: 415 }
    );
  }

  const ip = clientIp(request);
  const limited = await hitRateLimit({
    bucketKey: loginRateBucket(ip),
    limit: 10,
    windowSeconds: 60,
  });
  if (!limited.ok) {
    const status = limited.error === "RATE_LIMITED" ? 429 : 503;
    gatewayLog({
      route: "auth/login",
      error_code: limited.error,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      {
        ok: false,
        error_code: limited.error === "RATE_LIMITED" ? "RATE_LIMITED" : "CONFIG_ERROR",
        error_message:
          limited.error === "RATE_LIMITED"
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

  if (!verifyStaffPassword(password)) {
    gatewayLog({
      route: "auth/login",
      error_code: "UNAUTHORIZED",
      duration_ms: Date.now() - started,
      ok: false,
    });
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
