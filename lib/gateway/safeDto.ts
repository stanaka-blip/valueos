const ALLOWED_ERROR_CODES = new Set([
  "INVALID_INPUT",
  "PRICE_NOT_FOUND",
  "PACKAGE_ITEMS_NOT_FOUND",
  "PACKAGE_ITEM_PRICE_NOT_FOUND",
  "REQUEST_ID_CONFLICT",
  "REGISTRATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "BAD_REQUEST",
  "CONFIG_ERROR",
]);

export type SafeCaseRegistrationDto = {
  ok: boolean;
  status: string;
  request_id?: string;
  case_id?: string | null;
  case_no?: string | null;
  idempotent_replay?: boolean;
  error_code?: string;
  error_message?: string;
};

function looksInternal(message: string): boolean {
  return (
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(message) ||
    /constraint|pg_|SQLSTATE|permission denied|service.?role|INTERNAL_/i.test(message) ||
    /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(message)
  );
}

export function sanitizeErrorCode(code: unknown): string {
  if (typeof code === "string" && ALLOWED_ERROR_CODES.has(code)) return code;
  return "REGISTRATION_FAILED";
}

export function sanitizeErrorMessage(message: unknown, fallback: string): string {
  if (typeof message !== "string" || !message.trim()) return fallback;
  if (looksInternal(message)) return fallback;
  if (message.length > 200) return fallback;
  return message;
}

export function toSafeCaseRegistrationDto(
  raw: unknown,
  fallbackRequestId?: string
): SafeCaseRegistrationDto {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const ok = obj.ok === true;
  const status = typeof obj.status === "string" ? obj.status : ok ? "COMPLETED" : "FAILED";

  if (ok) {
    return {
      ok: true,
      status: status === "COMPLETED" ? "COMPLETED" : status,
      request_id:
        typeof obj.request_id === "string"
          ? obj.request_id
          : fallbackRequestId,
      case_id: typeof obj.case_id === "string" ? obj.case_id : null,
      case_no: typeof obj.case_no === "string" ? obj.case_no : null,
      idempotent_replay: obj.idempotent_replay === true,
    };
  }

  return {
    ok: false,
    status: status === "PROCESSING" ? "PROCESSING" : "FAILED",
    request_id:
      typeof obj.request_id === "string" ? obj.request_id : fallbackRequestId,
    error_code: sanitizeErrorCode(obj.error_code),
    error_message: sanitizeErrorMessage(
      obj.error_message,
      "登録を完了できませんでした"
    ),
    idempotent_replay: false,
  };
}

export function gatewayLog(fields: {
  route: string;
  request_id?: string;
  error_code?: string;
  duration_ms?: number;
  ok?: boolean;
}) {
  // 顧客情報・秘密値・payload は出さない
  console.info(
    JSON.stringify({
      level: "info",
      ...fields,
    })
  );
}
