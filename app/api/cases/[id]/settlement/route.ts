import { NextResponse, type NextRequest } from "next/server";

import { saveCaseSettlementByCaseId } from "@/lib/caseSettlements/saveCaseSettlement";
import {
  toSafeSettlementError,
  toSafeSettlementSuccess,
} from "@/lib/caseSettlements/safeSettlementDto";
import type { SettlementSaveBody } from "@/lib/caseSettlements/settlementSaveLogic";
import { isUuid } from "@/lib/gateway/authCookie";
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
 * 案件詳細の決済条件保存。
 * - cookie / CSRF / Origin 必須
 * - service role はサーバー内のみ
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const started = Date.now();
  const { id: caseId } = await params;

  const originResult = assertAppOrigin(request);
  if (originResult !== "ok") {
    const err = originErrorResponse(originResult);
    gatewayLog({
      route: "cases/settlement",
      error_code: err.body.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(err.body, { status: err.status });
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    gatewayLog({
      route: "cases/settlement",
      error_code: "UNAUTHORIZED",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafeSettlementError({
        error_code: "UNAUTHORIZED",
        error_message: "認証が必要です",
      }),
      { status: 401 }
    );
  }

  if (!assertCsrf(request, session)) {
    gatewayLog({
      route: "cases/settlement",
      error_code: "FORBIDDEN",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafeSettlementError({
        error_code: "FORBIDDEN",
        error_message: "不正なリクエストです",
      }),
      { status: 403 }
    );
  }

  if (!requireJsonContentType(request)) {
    return NextResponse.json(
      toSafeSettlementError({
        error_code: "BAD_REQUEST",
        error_message: "不正なリクエストです",
      }),
      { status: 415 }
    );
  }

  if (!isUuid(caseId)) {
    return NextResponse.json(
      toSafeSettlementError({
        error_code: "BAD_REQUEST",
        error_message: "案件IDが不正です",
      }),
      { status: 400 }
    );
  }

  const bodyResult = await readJsonBodyLimited(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      toSafeSettlementError({
        error_code: "BAD_REQUEST",
        error_message:
          bodyResult.reason === "TOO_LARGE"
            ? "リクエストが大きすぎます"
            : "不正なリクエストです",
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
      toSafeSettlementError({
        error_code: "INVALID_INPUT",
        error_message: "入力内容が正しくありません",
      }),
      { status: 400 }
    );
  }

  const body = bodyResult.value as SettlementSaveBody;

  const result = await saveCaseSettlementByCaseId(caseId, body);

  if (!result.ok) {
    const status =
      result.error_code === "NOT_FOUND"
        ? 404
        : result.error_code === "CONFIG_ERROR"
          ? 503
          : result.error_code === "INVALID_INPUT"
            ? 400
            : 502;
    gatewayLog({
      route: "cases/settlement",
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafeSettlementError({
        error_code: result.error_code,
        error_message: result.error_message,
        field_errors: result.field_errors,
      }),
      { status }
    );
  }

  if (!isUuid(result.settlement_id)) {
    gatewayLog({
      route: "cases/settlement",
      error_code: "SETTLEMENT_SAVE_FAILED",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafeSettlementError({
        error_code: "SETTLEMENT_SAVE_FAILED",
        error_message: "決済条件を保存できませんでした",
      }),
      { status: 502 }
    );
  }

  gatewayLog({
    route: "cases/settlement",
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json(
    toSafeSettlementSuccess({
      settlement_id: result.settlement_id,
      created: result.created,
    }),
    { status: 200 }
  );
}
