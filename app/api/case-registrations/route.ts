import { NextResponse, type NextRequest } from "next/server";
import {
  CSRF_HEADER_NAME,
  deriveRequestId,
  isUuid,
} from "@/lib/gateway/authCookie";
import {
  assertCsrf,
  clientIp,
  getSessionFromRequest,
  readJsonBodyLimited,
  requireJsonContentType,
} from "@/lib/gateway/http";
import {
  hitRateLimit,
  registrationRateBucket,
} from "@/lib/gateway/rateLimit";
import {
  gatewayLog,
  toSafeCaseRegistrationDto,
} from "@/lib/gateway/safeDto";
import {
  getServiceRoleSupabase,
  ServerAdminConfigError,
} from "@/lib/supabase/serverAdmin";

export const runtime = "nodejs";

/**
 * 案件登録 RPC のサーバー入口。
 * - cookie 再検証必須（proxy だけの防御にしない）
 * - クライアント request_id は無視し、Idempotency-Key からサーバー派生
 */
export async function POST(request: NextRequest) {
  const started = Date.now();

  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        status: "FAILED",
        error_code: "UNAUTHORIZED",
        error_message: "認証が必要です",
      },
      { status: 401 }
    );
  }

  if (!assertCsrf(request, session)) {
    gatewayLog({
      route: "case-registrations",
      error_code: "FORBIDDEN",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      {
        ok: false,
        status: "FAILED",
        error_code: "FORBIDDEN",
        error_message: "不正なリクエストです",
      },
      { status: 403 }
    );
  }

  if (!requireJsonContentType(request)) {
    return NextResponse.json(
      {
        ok: false,
        status: "FAILED",
        error_code: "BAD_REQUEST",
        error_message: "不正なリクエストです",
      },
      { status: 415 }
    );
  }

  const ip = clientIp(request);
  const limited = await hitRateLimit({
    bucketKey: registrationRateBucket(session.sid, ip),
    limit: 30,
    windowSeconds: 60,
  });
  if (!limited.ok) {
    const status = limited.error === "RATE_LIMITED" ? 429 : 503;
    gatewayLog({
      route: "case-registrations",
      error_code: limited.error,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      {
        ok: false,
        status: "FAILED",
        error_code: limited.error === "RATE_LIMITED" ? "RATE_LIMITED" : "CONFIG_ERROR",
        error_message:
          limited.error === "RATE_LIMITED"
            ? "しばらく時間をおいて再度お試しください"
            : "サーバー設定が完了していません",
      },
      { status }
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key") || "";
  if (!isUuid(idempotencyKey)) {
    return NextResponse.json(
      {
        ok: false,
        status: "FAILED",
        error_code: "BAD_REQUEST",
        error_message: "Idempotency-Key が必要です",
      },
      { status: 400 }
    );
  }

  const body = await readJsonBodyLimited(request);
  if (!body.ok) {
    return NextResponse.json(
      {
        ok: false,
        status: "FAILED",
        error_code: "BAD_REQUEST",
        error_message:
          body.reason === "TOO_LARGE" ? "リクエストが大きすぎます" : "不正なリクエストです",
      },
      { status: body.reason === "TOO_LARGE" ? 413 : 400 }
    );
  }

  if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
    return NextResponse.json(
      {
        ok: false,
        status: "FAILED",
        error_code: "INVALID_INPUT",
        error_message: "入力内容が正しくありません",
      },
      { status: 400 }
    );
  }

  const input = body.value as Record<string, unknown>;
  // クライアント request_id は信用せず破棄
  const { request_id: _ignored, ...rest } = input;
  void _ignored;

  const requestId = deriveRequestId(session.sid, idempotencyKey);
  const payload = {
    ...rest,
    request_id: requestId,
  };

  try {
    // 非本番テスト専用スタブ（本番RPCは呼ばない）
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.GATEWAY_RPC_STUB === "success"
    ) {
      const dto = toSafeCaseRegistrationDto(
        {
          ok: true,
          status: "COMPLETED",
          request_id: requestId,
          case_id: "11111111-1111-1111-1111-111111111111",
          case_no: "VE-TEST",
          idempotent_replay: false,
        },
        requestId
      );
      gatewayLog({
        route: "case-registrations",
        request_id: requestId,
        duration_ms: Date.now() - started,
        ok: true,
      });
      return NextResponse.json(dto, { status: 200 });
    }
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.GATEWAY_RPC_STUB === "failure"
    ) {
      const dto = toSafeCaseRegistrationDto(
        {
          ok: false,
          status: "FAILED",
          request_id: requestId,
          error_code: "PRICE_NOT_FOUND",
          error_message: "価格が見つかりません",
        },
        requestId
      );
      gatewayLog({
        route: "case-registrations",
        request_id: requestId,
        error_code: dto.error_code,
        duration_ms: Date.now() - started,
        ok: false,
      });
      return NextResponse.json(dto, { status: 400 });
    }

    const client = getServiceRoleSupabase();
    const { data, error } = await client.rpc("create_case_registration", {
      payload,
    });

    if (error) {
      const dto = toSafeCaseRegistrationDto(
        {
          ok: false,
          status: "FAILED",
          request_id: requestId,
          error_code: "REGISTRATION_FAILED",
          error_message: "登録を完了できませんでした",
        },
        requestId
      );
      gatewayLog({
        route: "case-registrations",
        request_id: requestId,
        error_code: dto.error_code,
        duration_ms: Date.now() - started,
        ok: false,
      });
      return NextResponse.json(dto, { status: 502 });
    }

    const dto = toSafeCaseRegistrationDto(data, requestId);
    gatewayLog({
      route: "case-registrations",
      request_id: requestId,
      error_code: dto.ok ? undefined : dto.error_code,
      duration_ms: Date.now() - started,
      ok: dto.ok,
    });
    return NextResponse.json(dto, { status: dto.ok ? 200 : 400 });
  } catch (e) {
    const code = e instanceof ServerAdminConfigError ? "CONFIG_ERROR" : "REGISTRATION_FAILED";
    gatewayLog({
      route: "case-registrations",
      request_id: requestId,
      error_code: code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      {
        ok: false,
        status: "FAILED",
        request_id: requestId,
        error_code: code,
        error_message:
          code === "CONFIG_ERROR"
            ? "サーバー設定が完了していません"
            : "登録を完了できませんでした",
      },
      { status: code === "CONFIG_ERROR" ? 503 : 500 }
    );
  }
}

// CSRF ヘッダ名をクライアント実装向けにコメント保持
void CSRF_HEADER_NAME;
