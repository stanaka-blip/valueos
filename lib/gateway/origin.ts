import type { NextRequest } from "next/server";

export type OriginCheckResult = "ok" | "forbidden" | "config_error";

/**
 * INTERNAL_APP_ORIGIN との完全一致のみ許可。前方一致・複数Originは不可。
 * Origin 欠落・不一致は forbidden。未設定は config_error。
 */
export function assertAppOrigin(request: NextRequest): OriginCheckResult {
  const expected = process.env.INTERNAL_APP_ORIGIN;
  if (!expected || !expected.startsWith("http")) {
    return "config_error";
  }

  // 末尾スラッシュ差で曖昧一致させない（完全一致）
  const origin = request.headers.get("origin");
  if (!origin) {
    return "forbidden";
  }
  if (origin !== expected) {
    return "forbidden";
  }
  return "ok";
}

export function originErrorResponse(result: Exclude<OriginCheckResult, "ok">) {
  if (result === "config_error") {
    return {
      status: 503 as const,
      body: {
        ok: false,
        error_code: "CONFIG_ERROR",
        error_message: "サーバー設定が完了していません",
      },
    };
  }
  return {
    status: 403 as const,
    body: {
      ok: false,
      error_code: "FORBIDDEN",
      error_message: "不正なリクエストです",
    },
  };
}
