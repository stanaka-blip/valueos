import type { ExecuteMoneyActionResult } from "@/lib/threeParty/executeMoneyActionCore";
import type { MoneyFieldErrors } from "@/lib/threeParty/moneyActionsLogic";

const ALLOWED = new Set([
  "INVALID_INPUT",
  "NOT_FOUND",
  "CONFLICT",
  "IMMUTABLE",
  "REQUEST_ID_CONFLICT",
  "REQUEST_IN_PROGRESS",
  "CONFIG_ERROR",
  "ACTION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "BAD_REQUEST",
]);

function looksInternal(message: string): boolean {
  return (
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
      message
    ) ||
    /constraint|pg_|SQLSTATE|permission denied|service.?role|INTERNAL_/i.test(
      message
    ) ||
    /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(message)
  );
}

export function toSafeMoneyError(input: {
  error_code: string;
  error_message: string;
  request_id?: string;
  field_errors?: MoneyFieldErrors;
}) {
  const code = ALLOWED.has(input.error_code)
    ? input.error_code
    : "ACTION_FAILED";
  const message =
    typeof input.error_message === "string" &&
    input.error_message.trim() &&
    !looksInternal(input.error_message) &&
    input.error_message.length <= 200
      ? input.error_message
      : "処理を完了できませんでした";

  return {
    ok: false as const,
    error_code: code,
    error_message: message,
    request_id: input.request_id,
    field_errors: input.field_errors,
  };
}

export function toSafeMoneySuccess(result: Extract<ExecuteMoneyActionResult, { ok: true }>) {
  return {
    ok: true as const,
    request_id: result.request_id,
    action: result.action,
    case_id: result.case_id,
    resource_id: result.resource_id,
    status: result.status,
    idempotent_replay: result.idempotent_replay === true,
  };
}

export function httpStatusForMoneyError(code: string): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
    case "REQUEST_ID_CONFLICT":
    case "REQUEST_IN_PROGRESS":
    case "IMMUTABLE":
      return 409;
    case "CONFIG_ERROR":
      return 503;
    case "BAD_REQUEST":
    case "INVALID_INPUT":
      return 400;
    default:
      return 500;
  }
}
