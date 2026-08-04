import { NextResponse, type NextRequest } from "next/server";

import { createPurchaseOrdersByCaseId } from "@/lib/purchaseOrders/createPurchaseOrders";
import {
  toSafePurchaseOrderError,
  toSafePurchaseOrderSuccess,
} from "@/lib/purchaseOrders/safePurchaseOrderDto";
import {
  AuthConfigError,
  derivePurchaseOrderCreateRequestId,
  isUuid,
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
 * 案件からの仕入発注一括作成。
 * - cookie / CSRF / Origin / JSON Content-Type / Idempotency-Key 必須
 * - case_id は URL を正とする（body の case_id / request_id は信用しない）
 * - create_purchase_orders RPC を service_role でのみ実行
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const started = Date.now();
  const { id: caseId } = await params;

  const originResult = assertAppOrigin(request);
  if (originResult !== "ok") {
    const err = originErrorResponse(originResult);
    gatewayLog({
      route: "cases/purchase-orders",
      error_code: err.body.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(err.body, { status: err.status });
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    gatewayLog({
      route: "cases/purchase-orders",
      error_code: "UNAUTHORIZED",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafePurchaseOrderError({
        error_code: "UNAUTHORIZED",
        error_message: "認証が必要です",
      }),
      { status: 401 }
    );
  }

  if (!assertCsrf(request, session)) {
    gatewayLog({
      route: "cases/purchase-orders",
      error_code: "FORBIDDEN",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafePurchaseOrderError({
        error_code: "FORBIDDEN",
        error_message: "不正なリクエストです",
      }),
      { status: 403 }
    );
  }

  if (!requireJsonContentType(request)) {
    return NextResponse.json(
      toSafePurchaseOrderError({
        error_code: "BAD_REQUEST",
        error_message: "不正なリクエストです",
      }),
      { status: 415 }
    );
  }

  if (!isUuid(caseId)) {
    return NextResponse.json(
      toSafePurchaseOrderError({
        error_code: "BAD_REQUEST",
        error_message: "案件IDが不正です",
      }),
      { status: 400 }
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key") || "";
  if (!isUuid(idempotencyKey)) {
    return NextResponse.json(
      toSafePurchaseOrderError({
        error_code: "BAD_REQUEST",
        error_message: "Idempotency-Key が必要です",
      }),
      { status: 400 }
    );
  }

  let requestId: string;
  try {
    requestId = derivePurchaseOrderCreateRequestId(session.sid, idempotencyKey);
  } catch (e) {
    if (e instanceof AuthConfigError) {
      return NextResponse.json(
        toSafePurchaseOrderError({
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
      toSafePurchaseOrderError({
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
      toSafePurchaseOrderError({
        error_code: "INVALID_INPUT",
        error_message: "入力内容が正しくありません",
        request_id: requestId,
      }),
      { status: 400 }
    );
  }

  const input = bodyResult.value as Record<string, unknown>;
  const {
    request_id: _ignoredRequestId,
    case_id: _ignoredCaseId,
    ...rest
  } = input;
  void _ignoredRequestId;
  void _ignoredCaseId;

  const result = await createPurchaseOrdersByCaseId(caseId, requestId, rest);

  if (!result.ok) {
    const status =
      result.error_code === "NOT_FOUND"
        ? 404
        : result.error_code === "CONFIG_ERROR"
          ? 503
          : result.error_code === "INVALID_INPUT" ||
              result.error_code === "DUPLICATE_ORDER_NO" ||
              result.error_code === "REQUEST_ID_CONFLICT" ||
              result.error_code === "REQUEST_IN_PROGRESS"
            ? 400
            : 502;
    gatewayLog({
      route: "cases/purchase-orders",
      request_id: requestId,
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafePurchaseOrderError({
        error_code: result.error_code,
        error_message: result.error_message,
        field_errors: result.field_errors,
        request_id: result.request_id || requestId,
      }),
      { status }
    );
  }

  gatewayLog({
    route: "cases/purchase-orders",
    request_id: requestId,
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json(
    toSafePurchaseOrderSuccess({
      request_id: result.request_id,
      case_id: result.case_id,
      orders: result.orders,
      idempotent_replay: result.idempotent_replay,
    }),
    { status: 200 }
  );
}
