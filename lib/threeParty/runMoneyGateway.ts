import { NextResponse, type NextRequest } from "next/server";

import {
  AuthConfigError,
  deriveThreePartyMoneyRequestId,
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
import { executeMoneyAction } from "@/lib/threeParty/executeMoneyAction";
import {
  type MoneyAction,
  validateMoneyActionInput,
} from "@/lib/threeParty/moneyActionsLogic";
import {
  httpStatusForMoneyError,
  toSafeMoneyError,
  toSafeMoneySuccess,
} from "@/lib/threeParty/safeMoneyDto";

export async function runMoneyGateway(input: {
  request: NextRequest;
  route: string;
  action: MoneyAction;
  caseId: string | null;
  resourceId: string | null;
}): Promise<NextResponse> {
  const started = Date.now();
  const { request, route, action, caseId, resourceId } = input;

  const originResult = assertAppOrigin(request);
  if (originResult !== "ok") {
    const err = originErrorResponse(originResult);
    gatewayLog({
      route,
      error_code: err.body.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(err.body, { status: err.status });
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    gatewayLog({
      route,
      error_code: "UNAUTHORIZED",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafeMoneyError({
        error_code: "UNAUTHORIZED",
        error_message: "認証が必要です",
      }),
      { status: 401 }
    );
  }

  if (!assertCsrf(request, session)) {
    gatewayLog({
      route,
      error_code: "FORBIDDEN",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafeMoneyError({
        error_code: "FORBIDDEN",
        error_message: "不正なリクエストです",
      }),
      { status: 403 }
    );
  }

  if (!requireJsonContentType(request)) {
    return NextResponse.json(
      toSafeMoneyError({
        error_code: "BAD_REQUEST",
        error_message: "不正なリクエストです",
      }),
      { status: 415 }
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key") || "";
  if (!isUuid(idempotencyKey)) {
    return NextResponse.json(
      toSafeMoneyError({
        error_code: "BAD_REQUEST",
        error_message: "Idempotency-Key が必要です",
      }),
      { status: 400 }
    );
  }

  let requestId: string;
  try {
    requestId = deriveThreePartyMoneyRequestId(
      sessionActorKey(session),
      idempotencyKey
    );
  } catch (e) {
    if (e instanceof AuthConfigError) {
      return NextResponse.json(
        toSafeMoneyError({
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
      toSafeMoneyError({
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

  const validated = validateMoneyActionInput({
    action,
    caseId,
    resourceId,
    body: bodyResult.value,
  });
  if (!validated.ok) {
    gatewayLog({
      route,
      request_id: requestId,
      error_code: validated.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafeMoneyError({
        error_code: validated.error_code,
        error_message: validated.error_message,
        request_id: requestId,
        field_errors: validated.field_errors,
      }),
      { status: 400 }
    );
  }

  const result = await executeMoneyAction(requestId, validated.value);
  if (!result.ok) {
    gatewayLog({
      route,
      request_id: requestId,
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      toSafeMoneyError({
        error_code: result.error_code,
        error_message: result.error_message,
        request_id: result.request_id || requestId,
        field_errors: result.field_errors,
      }),
      { status: httpStatusForMoneyError(result.error_code) }
    );
  }

  gatewayLog({
    route,
    request_id: requestId,
    duration_ms: Date.now() - started,
    ok: true,
  });
  return NextResponse.json(toSafeMoneySuccess(result), { status: 200 });
}
