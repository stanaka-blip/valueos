import { sanitizeErrorMessage } from "@/lib/gateway/safeDto";

const ALLOWED = new Set([
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "BAD_REQUEST",
  "CONFIG_ERROR",
  "NOT_FOUND",
  "PACKAGE_ITEMS_NOT_FOUND",
  "REQUEST_ID_CONFLICT",
  "LINE_ADD_FAILED",
  "RATE_LIMITED",
]);

export type SafeCaseLineDto = {
  ok: boolean;
  case_product_id?: string;
  case_package_id?: string;
  line_type?: string;
  request_id?: string;
  idempotent_replay?: boolean;
  error_code?: string;
  error_message?: string;
  field_errors?: Record<string, string>;
};

export function toSafeCaseLineError(input: {
  error_code?: string;
  error_message?: string;
  field_errors?: Record<string, string | undefined>;
  request_id?: string;
}): SafeCaseLineDto {
  const code =
    typeof input.error_code === "string" && ALLOWED.has(input.error_code)
      ? input.error_code
      : "LINE_ADD_FAILED";

  const field_errors: Record<string, string> = {};
  if (input.field_errors) {
    for (const [k, v] of Object.entries(input.field_errors)) {
      if (typeof v === "string" && v.trim() && v.length <= 100) {
        field_errors[k] = v;
      }
    }
  }

  return {
    ok: false,
    error_code: code,
    error_message: sanitizeErrorMessage(
      input.error_message,
      "明細を追加できませんでした"
    ),
    ...(typeof input.request_id === "string"
      ? { request_id: input.request_id }
      : {}),
    ...(Object.keys(field_errors).length > 0 ? { field_errors } : {}),
  };
}

export function toSafeCaseLineSuccess(input: {
  case_product_id: string;
  line_type: string;
  case_package_id?: string;
  request_id?: string;
  idempotent_replay?: boolean;
}): SafeCaseLineDto {
  return {
    ok: true,
    case_product_id: input.case_product_id,
    line_type: input.line_type,
    ...(input.case_package_id
      ? { case_package_id: input.case_package_id }
      : {}),
    ...(typeof input.request_id === "string"
      ? { request_id: input.request_id }
      : {}),
    idempotent_replay: input.idempotent_replay === true,
  };
}
