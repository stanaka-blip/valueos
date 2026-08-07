import { NextResponse, type NextRequest } from "next/server";

import { getCompanySettingsAdmin } from "@/lib/companyInfo/getCompanySettingsAdmin";
import { saveCompanySettingsAdmin } from "@/lib/companyInfo/saveCompanySettingsAdmin";
import {
  toCompanySettingsDto,
  type CompanySettingsSaveBody,
} from "@/lib/companyInfo/companySettingsDto";
import {
  assertCsrf,
  getSessionFromRequest,
  readJsonBodyLimited,
  requireJsonContentType,
} from "@/lib/gateway/http";
import { assertAppOrigin, originErrorResponse } from "@/lib/gateway/origin";
import { gatewayLog } from "@/lib/gateway/safeDto";

export const runtime = "nodejs";

function errorBody(input: {
  error_code: string;
  error_message: string;
  field_errors?: Record<string, string>;
}) {
  return {
    ok: false as const,
    error_code: input.error_code,
    error_message: input.error_message,
    ...(input.field_errors ? { field_errors: input.field_errors } : {}),
  };
}

/**
 * 会社情報取得。
 * - staff cookie 必須（/api/auth/csrf と同様。Origin / CSRF は不要）
 * - service role はサーバー内のみ
 */
export async function GET(request: NextRequest) {
  const started = Date.now();

  const session = getSessionFromRequest(request);
  if (!session) {
    gatewayLog({
      route: "settings/company",
      error_code: "UNAUTHORIZED",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      errorBody({
        error_code: "UNAUTHORIZED",
        error_message: "認証が必要です",
      }),
      { status: 401 }
    );
  }

  const result = await getCompanySettingsAdmin();
  if (!result.ok) {
    const status = result.error_code === "CONFIG_ERROR" ? 503 : 502;
    gatewayLog({
      route: "settings/company",
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      errorBody({
        error_code: result.error_code,
        error_message: result.error_message,
      }),
      { status }
    );
  }

  gatewayLog({
    route: "settings/company",
    duration_ms: Date.now() - started,
    ok: true,
  });

  return NextResponse.json(
    {
      ok: true as const,
      data: toCompanySettingsDto(result.data),
      source: result.source,
    },
    { status: 200 }
  );
}

/**
 * 会社情報更新。
 * - cookie / CSRF / Origin 必須
 * - service role はサーバー内のみ
 */
export async function PUT(request: NextRequest) {
  const started = Date.now();

  const originResult = assertAppOrigin(request);
  if (originResult !== "ok") {
    const err = originErrorResponse(originResult);
    gatewayLog({
      route: "settings/company",
      error_code: err.body.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(err.body, { status: err.status });
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    gatewayLog({
      route: "settings/company",
      error_code: "UNAUTHORIZED",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      errorBody({
        error_code: "UNAUTHORIZED",
        error_message: "認証が必要です",
      }),
      { status: 401 }
    );
  }

  if (!assertCsrf(request, session)) {
    gatewayLog({
      route: "settings/company",
      error_code: "FORBIDDEN",
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      errorBody({
        error_code: "FORBIDDEN",
        error_message: "不正なリクエストです",
      }),
      { status: 403 }
    );
  }

  if (!requireJsonContentType(request)) {
    return NextResponse.json(
      errorBody({
        error_code: "BAD_REQUEST",
        error_message: "不正なリクエストです",
      }),
      { status: 415 }
    );
  }

  const bodyResult = await readJsonBodyLimited(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      errorBody({
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
      errorBody({
        error_code: "INVALID_INPUT",
        error_message: "入力内容が正しくありません",
      }),
      { status: 400 }
    );
  }

  const result = await saveCompanySettingsAdmin(
    bodyResult.value as CompanySettingsSaveBody
  );

  if (!result.ok) {
    const status =
      result.error_code === "CONFIG_ERROR"
        ? 503
        : result.error_code === "INVALID_INPUT"
          ? 400
          : 502;
    gatewayLog({
      route: "settings/company",
      error_code: result.error_code,
      duration_ms: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      errorBody({
        error_code: result.error_code,
        error_message: result.error_message,
        field_errors: result.field_errors,
      }),
      { status }
    );
  }

  gatewayLog({
    route: "settings/company",
    duration_ms: Date.now() - started,
    ok: true,
  });

  return NextResponse.json(
    {
      ok: true as const,
      data: result.data,
    },
    { status: 200 }
  );
}
