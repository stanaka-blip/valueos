import { sanitizeErrorMessage } from "@/lib/gateway/safeDto";

const ALLOWED = new Set([
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "BAD_REQUEST",
  "CONFIG_ERROR",
  "NOT_FOUND",
  "SETTLEMENT_SAVE_FAILED",
  "RATE_LIMITED",
]);

export type SafeSettlementDto = {
  ok: boolean;
  settlement_id?: string;
  created?: boolean;
  error_code?: string;
  error_message?: string;
  field_errors?: Record<string, string>;
};

export function toSafeSettlementError(input: {
  error_code?: string;
  error_message?: string;
  field_errors?: Record<string, string | undefined>;
}): SafeSettlementDto {
  const code =
    typeof input.error_code === "string" && ALLOWED.has(input.error_code)
      ? input.error_code
      : "SETTLEMENT_SAVE_FAILED";

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
      "決済条件を保存できませんでした"
    ),
    ...(Object.keys(field_errors).length > 0 ? { field_errors } : {}),
  };
}

export function toSafeSettlementSuccess(input: {
  settlement_id: string;
  created: boolean;
}): SafeSettlementDto {
  return {
    ok: true,
    settlement_id: input.settlement_id,
    created: input.created,
  };
}
