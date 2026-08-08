import { NextResponse, type NextRequest } from "next/server";

import {
  AuthConfigError,
  deriveDealerSalesPriceBulkRequestId,
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
import { createDealerSalesPrices } from "@/lib/dealerSalesPrices/createDealerSalesPrices";
import {
  toSafeDealerSalesPricesError,
  toSafeDealerSalesPricesSuccess,
} from "@/lib/dealerSalesPrices/safeDealerSalesPricesDto";

export const runtime = "nodejs";

/**
 * 販売店起点の販売価格一括登録（PRODUCT のみ）。
 * create_dealer_sales_prices RPC を service_role でのみ実行。
 */
export async function POST(request: NextRequest) {
  const started = Date.now();

  const originResult = assertAppOrigin(request);
  if (originResult !== "ok") {
    const err = originErrorResponse(originResult);
    gatewayLog({
      route: "dealer-sales-price-bulks",
      error_code: err.body.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(err.body, { status: err.status });
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      toSafeDealerSalesPricesError({
        error_code: "UNAUTHORIZED",
        error_message: "認証が必要です",
      }),
      { status: 401 }
    );
  }

  if (!assertCsrf(request, session)) {
    return NextResponse.json(
      toSafeDealerSalesPricesError({
        error_code: "FORBIDDEN",
        error_message: "不正なリクエストです",
      }),
      { status: 403 }
    );
  }

  if (!requireJsonContentType(request)) {
    return NextResponse.json(
      toSafeDealerSalesPricesError({
        error_code: "BAD_REQUEST",
        error_message: "不正なリクエストです",
      }),
      { status: 415 }
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key") || "";
  if (!isUuid(idempotencyKey)) {
    return NextResponse.json(
      toSafeDealerSalesPricesError({
        error_code: "BAD_REQUEST",
        error_message: "Idempotency-Key が必要です",
      }),
      { status: 400 }
    );
  }

  let requestId: string;
  try {
    requestId = deriveDealerSalesPriceBulkRequestId(sessionActorKey(session), idempotencyKey);
  } catch (e) {
    if (e instanceof AuthConfigError) {
      return NextResponse.json(
        toSafeDealerSalesPricesError({
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
      toSafeDealerSalesPricesError({
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
      toSafeDealerSalesPricesError({
        error_code: "INVALID_INPUT",
        error_message: "入力内容が正しくありません",
        request_id: requestId,
      }),
      { status: 400 }
    );
  }

  const input = bodyResult.value as Record<string, unknown>;
  const { request_id: _ignored, ...rest } = input;
  void _ignored;

  const result = await createDealerSalesPrices(requestId, rest);

  if (!result.ok) {
    const status =
      result.error_code === "NOT_FOUND"
        ? 404
        : result.error_code === "CONFIG_ERROR"
          ? 503
          : result.error_code === "INVALID_INPUT" ||
              result.error_code === "REQUEST_ID_CONFLICT" ||
              result.error_code === "REQUEST_IN_PROGRESS"
            ? 400
            : 502;
    gatewayLog({
      route: "dealer-sales-price-bulks",
      request_id: requestId,
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafeDealerSalesPricesError({
        error_code: result.error_code,
        error_message: result.error_message,
        field_errors: result.field_errors,
        request_id: result.request_id || requestId,
      }),
      { status }
    );
  }

  gatewayLog({
    route: "dealer-sales-price-bulks",
    request_id: requestId,
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json(
    toSafeDealerSalesPricesSuccess({
      request_id: result.request_id,
      dealer_id: result.dealer_id,
      sales_price_ids: result.sales_price_ids,
      item_count: result.item_count,
      idempotent_replay: result.idempotent_replay,
    }),
    { status: 200 }
  );
}
