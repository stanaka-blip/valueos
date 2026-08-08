import { NextResponse, type NextRequest } from "next/server";

import {
  AuthConfigError,
  deriveExistingProductPriceSetupRequestId,
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
import { createExistingProductPriceSetup } from "@/lib/productSetup/createExistingProductPriceSetup";
import {
  toSafeProductSetupError,
  toSafeProductSetupSuccess,
} from "@/lib/productSetup/safeProductSetupDto";

export const runtime = "nodejs";

/**
 * 既存商品への仕入/販売価格一括追加。
 * - products は更新しない
 * - create_existing_product_price_setup RPC を service_role でのみ実行
 */
export async function POST(request: NextRequest) {
  const started = Date.now();

  const originResult = assertAppOrigin(request);
  if (originResult !== "ok") {
    const err = originErrorResponse(originResult);
    gatewayLog({
      route: "product-price-setups",
      error_code: err.body.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(err.body, { status: err.status });
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      toSafeProductSetupError({
        error_code: "UNAUTHORIZED",
        error_message: "認証が必要です",
      }),
      { status: 401 }
    );
  }

  if (!assertCsrf(request, session)) {
    return NextResponse.json(
      toSafeProductSetupError({
        error_code: "FORBIDDEN",
        error_message: "不正なリクエストです",
      }),
      { status: 403 }
    );
  }

  if (!requireJsonContentType(request)) {
    return NextResponse.json(
      toSafeProductSetupError({
        error_code: "BAD_REQUEST",
        error_message: "不正なリクエストです",
      }),
      { status: 415 }
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key") || "";
  if (!isUuid(idempotencyKey)) {
    return NextResponse.json(
      toSafeProductSetupError({
        error_code: "BAD_REQUEST",
        error_message: "Idempotency-Key が必要です",
      }),
      { status: 400 }
    );
  }

  let requestId: string;
  try {
    requestId = deriveExistingProductPriceSetupRequestId(
      session.sid,
      idempotencyKey
    );
  } catch (e) {
    if (e instanceof AuthConfigError) {
      return NextResponse.json(
        toSafeProductSetupError({
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
      toSafeProductSetupError({
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
      toSafeProductSetupError({
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

  const result = await createExistingProductPriceSetup(requestId, rest);

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
      route: "product-price-setups",
      request_id: requestId,
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafeProductSetupError({
        error_code: result.error_code,
        error_message: result.error_message,
        field_errors: result.field_errors,
        request_id: result.request_id || requestId,
      }),
      { status }
    );
  }

  gatewayLog({
    route: "product-price-setups",
    request_id: requestId,
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json(
    toSafeProductSetupSuccess({
      request_id: result.request_id,
      product_id: result.product_id,
      purchase_price_ids: result.purchase_price_ids,
      sales_price_ids: result.sales_price_ids,
      idempotent_replay: result.idempotent_replay,
    }),
    { status: 200 }
  );
}
