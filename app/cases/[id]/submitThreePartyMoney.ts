"use client";

import { createIdempotencyKey } from "@/app/components/case-registration/submitCaseRegistration";
import { safeUserErrorMessage } from "@/app/components/case-registration/validation";
import { moneyActionApiPath } from "@/lib/threeParty/moneyActionPaths";

export { createIdempotencyKey };

export type SubmitThreePartyMoneyResult =
  | {
      ok: true;
      resource_id: string;
      status: string;
      idempotent_replay?: boolean;
    }
  | {
      ok: false;
      error_code?: string;
      error_message: string;
      field_errors?: Record<string, string>;
    };

export async function submitThreePartyMoney(options: {
  action: string;
  caseId: string;
  resourceId?: string;
  body: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<SubmitThreePartyMoneyResult> {
  const path = moneyActionApiPath({
    action: options.action,
    caseId: options.caseId,
    resourceId: options.resourceId,
  });
  if (!path) {
    return { ok: false, error_message: "不正な操作です" };
  }

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

  const idempotencyKey = options.idempotencyKey || createIdempotencyKey();
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfData.csrfToken,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(options.body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    resource_id?: string;
    status?: string;
    idempotent_replay?: boolean;
    error_code?: string;
    error_message?: string;
    field_errors?: Record<string, string>;
  };

  if (res.ok && data.ok && typeof data.resource_id === "string") {
    return {
      ok: true,
      resource_id: data.resource_id,
      status: typeof data.status === "string" ? data.status : "",
      idempotent_replay: data.idempotent_replay === true,
    };
  }

  return {
    ok: false,
    error_code: data.error_code,
    error_message: safeUserErrorMessage(
      data.error_code,
      data.error_message || "処理に失敗しました"
    ),
    field_errors: data.field_errors,
  };
}
