import { safeUserErrorMessage } from "./validation";

export type GatewaySubmitResult =
  | {
      ok: true;
      case_id: string;
      case_no?: string | null;
      idempotent_replay?: boolean;
    }
  | {
      ok: false;
      error_code?: string;
      error_message: string;
    };

/**
 * CSRF 取得 → gateway POST。
 * Origin ヘッダーはブラウザに任せ、手動設定しない。
 */
export async function submitCaseRegistration(options: {
  body: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<GatewaySubmitResult> {
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
      error_message: safeUserErrorMessage(
        csrfData.error_code,
        csrfData.error_message || "認証が必要です"
      ),
    };
  }

  const res = await fetch("/api/case-registrations", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfData.csrfToken,
      "Idempotency-Key": options.idempotencyKey,
    },
    body: JSON.stringify(options.body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    case_id?: string | null;
    case_no?: string | null;
    idempotent_replay?: boolean;
    error_code?: string;
    error_message?: string;
  };

  if (res.ok && data.ok && typeof data.case_id === "string" && data.case_id) {
    return {
      ok: true,
      case_id: data.case_id,
      case_no: data.case_no,
      idempotent_replay: data.idempotent_replay === true,
    };
  }

  return {
    ok: false,
    error_code: data.error_code,
    error_message: safeUserErrorMessage(data.error_code, data.error_message),
  };
}

export function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
