/**
 * 案件詳細 決済保存クライアント。
 * CSRF 取得 → PUT /api/cases/:id/settlement。
 * Origin ヘッダーはブラウザに任せ、手動設定しない。
 */

export type SubmitCaseSettlementResult =
  | {
      ok: true;
      settlement_id: string;
      created: boolean;
    }
  | {
      ok: false;
      error_code?: string;
      error_message: string;
      field_errors?: Record<string, string>;
    };

export async function submitCaseSettlement(options: {
  caseId: string;
  body: Record<string, unknown>;
}): Promise<SubmitCaseSettlementResult> {
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
      error_message: csrfData.error_message || "認証が必要です",
    };
  }

  const res = await fetch(`/api/cases/${options.caseId}/settlement`, {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfData.csrfToken,
    },
    body: JSON.stringify(options.body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    settlement_id?: string;
    created?: boolean;
    error_code?: string;
    error_message?: string;
    field_errors?: Record<string, string>;
  };

  if (res.ok && data.ok && typeof data.settlement_id === "string") {
    return {
      ok: true,
      settlement_id: data.settlement_id,
      created: data.created === true,
    };
  }

  return {
    ok: false,
    error_code: data.error_code,
    error_message: data.error_message || "決済条件を保存できませんでした",
    field_errors: data.field_errors,
  };
}
