import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/database.types";

import {
  validateAddCaseLineBody,
  type AddCaseLineBody,
  type AddCaseLineFieldErrors,
} from "./addCaseLineLogic";

export type AddCaseLineResult =
  | {
      ok: true;
      case_product_id: string;
      case_package_id?: string;
      line_type: "PRODUCT" | "PACKAGE";
      request_id: string;
      idempotent_replay: boolean;
    }
  | {
      ok: false;
      error_code:
        | "INVALID_INPUT"
        | "NOT_FOUND"
        | "CONFIG_ERROR"
        | "PACKAGE_ITEMS_NOT_FOUND"
        | "REQUEST_ID_CONFLICT"
        | "LINE_ADD_FAILED";
      error_message: string;
      field_errors?: AddCaseLineFieldErrors;
      request_id?: string;
    };

type AdminClient = SupabaseClient<Database>;

type RpcRaw = {
  ok?: unknown;
  status?: unknown;
  request_id?: unknown;
  case_id?: unknown;
  case_product_id?: unknown;
  case_package_id?: unknown;
  line_type?: unknown;
  idempotent_replay?: unknown;
  error_code?: unknown;
  error_message?: unknown;
};

const ALLOWED_RPC_ERRORS = new Set([
  "INVALID_INPUT",
  "NOT_FOUND",
  "PACKAGE_ITEMS_NOT_FOUND",
  "REQUEST_ID_CONFLICT",
  "LINE_ADD_FAILED",
]);

/**
 * 冪等 payload（hash 対象）を構築する。
 * - request_id: サーバー派生
 * - case_id: URL を正とする
 * - line 正規化済みフィールドのみ（価格・仕入先は含めない）
 */
export function buildAppendCaseLinePayload(
  caseId: string,
  requestId: string,
  body: AddCaseLineBody
):
  | { ok: true; payload: Record<string, unknown> }
  | {
      ok: false;
      error_code: "INVALID_INPUT";
      error_message: string;
      field_errors?: AddCaseLineFieldErrors;
    } {
  const validated = validateAddCaseLineBody(body);
  if (!validated.ok) {
    return validated;
  }

  const payload: Record<string, unknown> = {
    request_id: requestId,
    case_id: caseId,
    line_type: validated.line.line_type,
    quantity: validated.line.quantity,
  };

  if (validated.line.line_type === "PRODUCT") {
    payload.product_id = validated.line.product_id;
  } else {
    payload.package_id = validated.line.package_id;
  }

  if (validated.line.memo != null) {
    payload.memo = validated.line.memo;
  }

  return { ok: true, payload };
}

function mapRpcResult(raw: RpcRaw, fallbackRequestId: string): AddCaseLineResult {
  if (raw.ok === true) {
    const lineType =
      raw.line_type === "PACKAGE" || raw.line_type === "PRODUCT"
        ? raw.line_type
        : null;
    const caseProductId =
      typeof raw.case_product_id === "string" ? raw.case_product_id : "";
    if (!lineType || !caseProductId) {
      return {
        ok: false,
        error_code: "LINE_ADD_FAILED",
        error_message: "明細を追加できませんでした",
        request_id: fallbackRequestId,
      };
    }
    return {
      ok: true,
      case_product_id: caseProductId,
      case_package_id:
        typeof raw.case_package_id === "string" ? raw.case_package_id : undefined,
      line_type: lineType,
      request_id:
        typeof raw.request_id === "string" ? raw.request_id : fallbackRequestId,
      idempotent_replay: raw.idempotent_replay === true,
    };
  }

  const code = (
    typeof raw.error_code === "string" && ALLOWED_RPC_ERRORS.has(raw.error_code)
      ? raw.error_code
      : "LINE_ADD_FAILED"
  ) as Extract<AddCaseLineResult, { ok: false }>["error_code"];

  return {
    ok: false,
    error_code: code,
    error_message:
      typeof raw.error_message === "string" && raw.error_message.trim()
        ? raw.error_message
        : "明細を追加できませんでした",
    request_id:
      typeof raw.request_id === "string" ? raw.request_id : fallbackRequestId,
  };
}

/**
 * append_case_line RPC 呼び出し（注入クライアント）。
 * 補償DELETEは行わない（RPC内トランザクションに委譲）。
 */
export async function addCaseLineByCaseIdWithClient(
  caseId: string,
  requestId: string,
  body: AddCaseLineBody,
  client: AdminClient
): Promise<AddCaseLineResult> {
  const built = buildAppendCaseLinePayload(caseId, requestId, body);
  if (!built.ok) {
    return built;
  }

  const { data, error } = await client.rpc("append_case_line", {
    payload: built.payload as Json,
  });

  if (error) {
    return {
      ok: false,
      error_code: "LINE_ADD_FAILED",
      error_message: "明細を追加できませんでした",
      request_id: requestId,
    };
  }

  const raw =
    data && typeof data === "object" ? (data as RpcRaw) : ({} as RpcRaw);
  return mapRpcResult(raw, requestId);
}
