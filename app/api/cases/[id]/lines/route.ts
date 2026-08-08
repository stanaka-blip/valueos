import { NextResponse, type NextRequest } from "next/server";

import { addCaseLineByCaseId } from "@/lib/caseLines/addCaseLine";
import type { AddCaseLineBody } from "@/lib/caseLines/addCaseLineLogic";
import {
  toSafeCaseLineError,
  toSafeCaseLineSuccess,
} from "@/lib/caseLines/safeCaseLineDto";
import {
  AuthConfigError,
  deriveCaseLineAppendRequestId,
  isUuid,
  sessionActorKey,
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

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 案件詳細の PRODUCT / PACKAGE 明細追加。
 * - cookie / CSRF / Origin / JSON Content-Type / Idempotency-Key 必須
 * - case_id は URL を正とする（body の case_id / request_id は信用しない）
 * - append_case_line RPC を service_role でのみ実行
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const started = Date.now();
  const { id: caseId } = await params;

  const originResult = assertAppOrigin(request);
  if (originResult !== "ok") {
    const err = originErrorResponse(originResult);
    gatewayLog({
      route: "cases/lines",
      error_code: err.body.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(err.body, { status: err.status });
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    gatewayLog({
      route: "cases/lines",
      error_code: "UNAUTHORIZED",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafeCaseLineError({
        error_code: "UNAUTHORIZED",
        error_message: "認証が必要です",
      }),
      { status: 401 }
    );
  }

  if (!assertCsrf(request, session)) {
    gatewayLog({
      route: "cases/lines",
      error_code: "FORBIDDEN",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafeCaseLineError({
        error_code: "FORBIDDEN",
        error_message: "不正なリクエストです",
      }),
      { status: 403 }
    );
  }

  if (!requireJsonContentType(request)) {
    return NextResponse.json(
      toSafeCaseLineError({
        error_code: "BAD_REQUEST",
        error_message: "不正なリクエストです",
      }),
      { status: 415 }
    );
  }

  if (!isUuid(caseId)) {
    return NextResponse.json(
      toSafeCaseLineError({
        error_code: "BAD_REQUEST",
        error_message: "案件IDが不正です",
      }),
      { status: 400 }
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key") || "";
  if (!isUuid(idempotencyKey)) {
    return NextResponse.json(
      toSafeCaseLineError({
        error_code: "BAD_REQUEST",
        error_message: "Idempotency-Key が必要です",
      }),
      { status: 400 }
    );
  }

  let requestId: string;
  try {
    requestId = deriveCaseLineAppendRequestId(sessionActorKey(session), idempotencyKey);
  } catch (e) {
    if (e instanceof AuthConfigError) {
      return NextResponse.json(
        toSafeCaseLineError({
          error_code: "CONFIG_ERROR",
          error_message: "サーバー設定が完了していません",
        }),
        { status: 503 }
      );
    }
    throw e;
  }

  const bodyResult = await readJsonBodyLimited(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      toSafeCaseLineError({
        error_code: "BAD_REQUEST",
        error_message:
          bodyResult.reason === "TOO_LARGE"
            ? "リクエストが大きすぎます"
            : "不正なリクエストです",
        request_id: requestId,
      }),
      { status: bodyResult.reason === "TOO_LARGE" ? 413 : 400 }
    );
  }

  if (
    !bodyResult.value ||
    typeof bodyResult.value !== "object" ||
    Array.isArray(bodyResult.value)
  ) {
    return NextResponse.json(
      toSafeCaseLineError({
        error_code: "INVALID_INPUT",
        error_message: "入力内容が正しくありません",
        request_id: requestId,
      }),
      { status: 400 }
    );
  }

  const input = bodyResult.value as Record<string, unknown>;
  // client request_id / case_id は信用しない
  const {
    request_id: _ignoredRequestId,
    case_id: _ignoredCaseId,
    ...rest
  } = input;
  void _ignoredRequestId;
  void _ignoredCaseId;

  const body = rest as AddCaseLineBody;
  const result = await addCaseLineByCaseId(caseId, requestId, body);

  if (!result.ok) {
    const status =
      result.error_code === "NOT_FOUND"
        ? 404
        : result.error_code === "CONFIG_ERROR"
          ? 503
          : result.error_code === "INVALID_INPUT" ||
              result.error_code === "PACKAGE_ITEMS_NOT_FOUND" ||
              result.error_code === "REQUEST_ID_CONFLICT"
            ? 400
            : 502;
    gatewayLog({
      route: "cases/lines",
      request_id: requestId,
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafeCaseLineError({
        error_code: result.error_code,
        error_message: result.error_message,
        field_errors: result.field_errors,
        request_id: result.request_id || requestId,
      }),
      { status }
    );
  }

  if (!isUuid(result.case_product_id)) {
    gatewayLog({
      route: "cases/lines",
      request_id: requestId,
      error_code: "LINE_ADD_FAILED",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafeCaseLineError({
        error_code: "LINE_ADD_FAILED",
        error_message: "明細を追加できませんでした",
        request_id: requestId,
      }),
      { status: 502 }
    );
  }

  gatewayLog({
    route: "cases/lines",
    request_id: requestId,
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json(
    toSafeCaseLineSuccess({
      case_product_id: result.case_product_id,
      line_type: result.line_type,
      case_package_id: result.case_package_id,
      request_id: result.request_id,
      idempotent_replay: result.idempotent_replay,
    }),
    { status: 200 }
  );
}
