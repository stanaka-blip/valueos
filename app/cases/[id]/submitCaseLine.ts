/**
 * 案件詳細の明細追加クライアント。
 * CSRF 取得 → POST /api/cases/:id/lines（Idempotency-Key 付き）。
 * Origin ヘッダーはブラウザに任せ、手動設定しない。
 * case_id は URL のみ。body に case_id / 価格 / 仕入先を載せない。
 */

import { createIdempotencyKey } from "@/app/components/case-registration/submitCaseRegistration";
import { safeUserErrorMessage } from "@/app/components/case-registration/validation";

export type CaseLineSubmitInput = {
  line_type: "PRODUCT" | "PACKAGE";
  product_id: string;
  package_id: string;
  quantity: string;
};

export type SubmitCaseLineResult =
  | {
      ok: true;
      case_product_id: string;
      case_package_id?: string;
      line_type: string;
      idempotent_replay?: boolean;
    }
  | {
      ok: false;
      error_code?: string;
      error_message: string;
      field_errors?: Record<string, string>;
    };

/** 明細追加ペイロードに影響する入力の指紋（Idempotency-Key 再生成判定用） */
export function caseLineFingerprint(input: CaseLineSubmitInput): string {
  return JSON.stringify({
    line_type: input.line_type,
    product_id: input.line_type === "PRODUCT" ? input.product_id : "",
    package_id: input.line_type === "PACKAGE" ? input.package_id : "",
    quantity: String(input.quantity ?? "").trim(),
  });
}

export { createIdempotencyKey };

function safeCaseLineUserErrorMessage(
  errorCode?: string,
  errorMessage?: string
): string {
  if (errorCode === "NOT_FOUND") return "案件が見つかりません";
  if (errorCode === "LINE_ADD_FAILED") return "明細を追加できませんでした";
  if (errorCode === "PACKAGE_ITEMS_NOT_FOUND") {
    return "パッケージ構成が見つかりません";
  }
  return safeUserErrorMessage(errorCode, errorMessage || "明細を追加できませんでした");
}

/**
 * CSRF 取得 → lines API POST。
 */
export async function submitCaseLine(options: {
  caseId: string;
  input: CaseLineSubmitInput;
  idempotencyKey: string;
}): Promise<SubmitCaseLineResult> {
  const csrfRes = await fetch("/api/auth/csrf", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const csrfData = (await csrfRes.json().catch(() => ({}))) as {
    csrfToken?: string;
    error_code?: string;
    error_message?: string;
  };
  if (!csrfRes.ok || !csrfData.csrfToken) {
    return {
      ok: false,
      error_code: csrfData.error_code,
      error_message: safeCaseLineUserErrorMessage(
        csrfData.error_code,
        csrfData.error_message || "認証が必要です"
      ),
    };
  }

  const quantity = Number(String(options.input.quantity).trim());
  const body: Record<string, unknown> = {
    line_type: options.input.line_type,
    quantity,
  };
  if (options.input.line_type === "PRODUCT") {
    body.product_id = options.input.product_id;
    body.package_id = null;
  } else {
    body.package_id = options.input.package_id;
    body.product_id = null;
  }

  const res = await fetch(`/api/cases/${options.caseId}/lines`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfData.csrfToken,
      "Idempotency-Key": options.idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    case_product_id?: string;
    case_package_id?: string;
    line_type?: string;
    idempotent_replay?: boolean;
    error_code?: string;
    error_message?: string;
    field_errors?: Record<string, string>;
  };

  if (
    res.ok &&
    data.ok &&
    typeof data.case_product_id === "string" &&
    data.case_product_id
  ) {
    return {
      ok: true,
      case_product_id: data.case_product_id,
      line_type: typeof data.line_type === "string" ? data.line_type : options.input.line_type,
      ...(typeof data.case_package_id === "string"
        ? { case_package_id: data.case_package_id }
        : {}),
      idempotent_replay: data.idempotent_replay === true,
    };
  }

  return {
    ok: false,
    error_code: data.error_code,
    error_message: safeCaseLineUserErrorMessage(
      data.error_code,
      data.error_message
    ),
    field_errors: data.field_errors,
  };
}
